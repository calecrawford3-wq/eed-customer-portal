import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { bridgeCall, BridgeError } from "../../shared/voipPhonebook.ts";

const MAX_MESSAGE_LENGTH = 2048;
const MAX_MEDIA_FILES = 3;
const MAX_MEDIA_BYTES = 1300 * 1024;

const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/midi",
  "audio/x-midi",
  "video/mp4",
  "video/3gpp",
]);

const ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "mp3",
  "wav",
  "mid",
  "midi",
  "mp4",
  "3gp",
]);

function normalizeNanpaNumber(value) {
  if (!value) return "";

  let digits = String(value).replace(/\D/g, "");

  if (digits.length === 10) {
    digits = `1${digits}`;
  }

  return digits;
}

function getFileExtension(value) {
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname || "";
    const fileName = pathname.split("/").pop() || "";

    if (!fileName.includes(".")) {
      return "";
    }

    return fileName
      .split(".")
      .pop()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  } catch {
    return "";
  }
}

function normalizeMediaInput(body) {
  const collected = [];

  const addMedia = (value) => {
    if (typeof value !== "string") return;

    const trimmed = value.trim();

    if (!trimmed) return;

    collected.push(trimmed);
  };

  if (Array.isArray(body?.media_urls)) {
    body.media_urls.forEach(addMedia);
  }

  if (Array.isArray(body?.media)) {
    body.media.forEach(addMedia);
  }

  addMedia(body?.media_url);
  addMedia(body?.media1);
  addMedia(body?.media2);
  addMedia(body?.media3);

  return [...new Set(collected)].slice(0, MAX_MEDIA_FILES);
}

function isDataUrl(value) {
  return /^data:[^;,]+;base64,/i.test(value);
}

function getDataUrlInfo(value) {
  const match = value.match(
    /^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i
  );

  if (!match) {
    return null;
  }

  const contentType = match[1].toLowerCase();
  const base64 = match[2].replace(/\s/g, "");

  /*
   * Estimate decoded byte size from Base64 length.
   */
  const padding = (base64.match(/=*$/) || [""])[0].length;
  const byteSize =
    Math.floor((base64.length * 3) / 4) - padding;

  return {
    contentType,
    base64,
    byteSize,
  };
}

async function validateRemoteMediaUrl(mediaUrl) {
  let parsed;

  try {
    parsed = new URL(mediaUrl);
  } catch {
    throw new Error("An attachment contains an invalid URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(
      "Attachment URLs must begin with http:// or https://."
    );
  }

  const extension = getFileExtension(mediaUrl);

  /*
   * Try checking the remote file. Some file hosts reject HEAD,
   * so failure to inspect does not automatically reject the URL.
   */
  try {
    const response = await fetch(mediaUrl, {
      method: "HEAD",
      redirect: "follow",
    });

    if (response.ok) {
      const contentType = String(
        response.headers.get("content-type") || ""
      )
        .split(";")[0]
        .trim()
        .toLowerCase();

      const contentLength = Number(
        response.headers.get("content-length") || 0
      );

      if (
        contentType &&
        !ALLOWED_MEDIA_TYPES.has(contentType) &&
        !ALLOWED_EXTENSIONS.has(extension)
      ) {
        throw new Error(
          `Unsupported attachment type: ${contentType}`
        );
      }

      if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_MEDIA_BYTES
      ) {
        throw new Error(
          "Each attachment must be 1,300 KB or smaller."
        );
      }
    }
  } catch (error) {
    /*
     * Preserve validation errors we intentionally generated.
     * Ignore ordinary HEAD/network failures because VoIP.ms may
     * still be able to retrieve the public URL.
     */
    if (
      error?.message?.startsWith("Unsupported attachment") ||
      error?.message?.includes("1,300 KB")
    ) {
      throw error;
    }
  }

  if (
    extension &&
    !ALLOWED_EXTENSIONS.has(extension)
  ) {
    throw new Error(
      `Unsupported attachment extension: .${extension}`
    );
  }

  return mediaUrl;
}

async function validateMedia(mediaItems) {
  if (mediaItems.length > MAX_MEDIA_FILES) {
    throw new Error(
      `A maximum of ${MAX_MEDIA_FILES} attachments is allowed.`
    );
  }

  const validated = [];

  for (const item of mediaItems) {
    if (isDataUrl(item)) {
      const info = getDataUrlInfo(item);

      if (!info) {
        throw new Error(
          "One of the Base64 attachments is malformed."
        );
      }

      if (!ALLOWED_MEDIA_TYPES.has(info.contentType)) {
        throw new Error(
          `Unsupported attachment type: ${info.contentType}`
        );
      }

      if (info.byteSize > MAX_MEDIA_BYTES) {
        throw new Error(
          "Each attachment must be 1,300 KB or smaller."
        );
      }

      validated.push(item);
      continue;
    }

    validated.push(
      await validateRemoteMediaUrl(item)
    );
  }

  return validated;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));

    /*
     * Destination number:
     *
     * canonicalTo is stored in Base44 as 1 + 10 digits.
     * apiTo is sent to VoIP.ms as a 10-digit NANPA number.
     */
    const canonicalTo = normalizeNanpaNumber(body?.to);

    if (!canonicalTo) {
      return Response.json(
        { error: "Missing destination number" },
        { status: 400 }
      );
    }

    if (
      canonicalTo.length !== 11 ||
      !canonicalTo.startsWith("1")
    ) {
      return Response.json(
        {
          error:
            "Destination must be a valid U.S. or Canadian phone number",
        },
        { status: 400 }
      );
    }

    const apiTo = canonicalTo.slice(1);

    /*
     * Read and validate attachments.
     */
    const rawMedia = normalizeMediaInput(body);

    if (rawMedia.length > MAX_MEDIA_FILES) {
      return Response.json(
        {
          error: `A maximum of ${MAX_MEDIA_FILES} attachments is allowed.`,
        },
        { status: 400 }
      );
    }

    let mediaUrls;

    try {
      mediaUrls = await validateMedia(rawMedia);
    } catch (error) {
      return Response.json(
        {
          error:
            error?.message ||
            "One or more attachments are invalid.",
        },
        { status: 400 }
      );
    }

    const enteredMessage = String(
      body?.message || ""
    ).trim();

    /*
     * VoIP.ms documents the MMS message field as required.
     * For a media-only message, use a small fallback caption.
     */
    const message =
      enteredMessage ||
      (mediaUrls.length > 0 ? "Photo" : "");

    if (!message && mediaUrls.length === 0) {
      return Response.json(
        {
          error:
            "Enter a message or attach at least one media file.",
        },
        { status: 400 }
      );
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return Response.json(
        {
          error:
            "Message too long. Maximum MMS text length is 2,048 characters.",
        },
        { status: 400 }
      );
    }

    /*
     * Sending number.
     */
    const canonicalFrom = normalizeNanpaNumber(
      Deno.env.get("VOIP_MS_FROM_NUMBER")
    );

    if (
      canonicalFrom.length !== 11 ||
      !canonicalFrom.startsWith("1")
    ) {
      return Response.json(
        {
          error:
            "VOIP_MS_FROM_NUMBER must be a valid U.S. or Canadian phone number",
        },
        { status: 500 }
      );
    }

    const apiFrom = canonicalFrom.slice(1);

    /*
     * Any media attachment forces MMS.
     * Text over 160 characters also forces MMS.
     */
    const isMms =
      mediaUrls.length > 0 ||
      message.length > 160;

    const method = isMms
      ? "sendMMS"
      : "sendSMS";

    /*
     * Build params for the bridge — the bridge adds api_username/api_password
     * from its own local settings.env, so VoIP.ms only sees the bridge's IP.
     */
    const voipParams = {
      did: apiFrom,
      dst: apiTo,
      message,
    };

    mediaUrls.forEach((mediaUrl, index) => {
      voipParams[`media${index + 1}`] = mediaUrl;
    });

    let data;
    let indeterminate = false;
    let indeterminateReason = "";

    try {
      data = await bridgeCall(method, voipParams);
    } catch (bridgeError) {
      console.error(
        `${method} bridge call failed`,
        JSON.stringify({
          error: bridgeError?.message || String(bridgeError),
          httpStatus: bridgeError?.httpStatus,
          voipmsStatus: bridgeError?.voipmsStatus,
          destination: apiTo,
          characterCount: message.length,
          mediaCount: mediaUrls.length,
        })
      );

      /*
       * Hard errors mean the message definitely did NOT send:
       *   403 = method not permitted, 401 = auth/sig failure, 503 = credentials incomplete
       * Anything else (502 gateway timeout, network error, etc.) typically means
       * the bridge forwarded the request to VoIP.ms but the response timed out —
       * the message likely went through even though we couldn't confirm it.
       */
      const isHardError =
        bridgeError instanceof BridgeError &&
        ([403, 401, 503].includes(bridgeError.httpStatus) ||
          bridgeError.voipmsStatus === "invalid_phonebook");

      if (isHardError) {
        return Response.json(
          {
            error:
              bridgeError?.message ||
              `Bridge ${method} call failed`,
          },
          { status: 502 }
        );
      }

      /*
       * Indeterminate: the bridge timed out or returned a non-definitive error.
       * The message was likely forwarded to VoIP.ms — save it as sent so the
       * user doesn't see a false "failed" error.
       */
      indeterminate = true;
      indeterminateReason =
        bridgeError?.message || "Bridge response timeout";
    }

    if (!indeterminate && (!data || data.status !== "success")) {
      console.error(
        `${method} failed`,
        JSON.stringify({
          response: data,
          destination: apiTo,
          characterCount: message.length,
          mediaCount: mediaUrls.length,
        })
      );

      return Response.json(
        {
          error:
            data?.message ||
            `VoIP.ms ${method} failed`,
          raw: data,
        },
        { status: 502 }
      );
    }

    const now = new Date().toISOString();

    /*
     * Save the outgoing message and its attachments.
     */
    await base44.asServiceRole.entities.Message.create({
      customer_id:
        body?.customer_id || null,

      customer_name:
        body?.customer_name || null,

      contact_name:
        body?.contact_name || null,

      phone_number: canonicalTo,

      direction: "outbound",

      from_number: canonicalFrom,
      to_number: canonicalTo,

      body: enteredMessage,

      media_urls: mediaUrls,

      channel: isMms
        ? "mms"
        : "sms",

      status: "sent",
      is_read: true,
      sent_at: now,
    });

    return Response.json({
      success: true,

      to: canonicalTo,
      api_to: apiTo,

      message: enteredMessage,

      message_type: isMms
        ? "mms"
        : "sms",

      character_count:
        enteredMessage.length,

      media_count:
        mediaUrls.length,

      media_urls: mediaUrls,

      indeterminate: indeterminate || undefined,
      indeterminate_reason: indeterminate
        ? indeterminateReason
        : undefined,
    });
  } catch (error) {
    console.error(
      "sendVoipSms error:",
      error?.message || error
    );

    return Response.json(
      {
        error:
          error?.message ||
          "Internal error",
      },
      { status: 500 }
    );
  }
});