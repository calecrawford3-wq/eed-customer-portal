interface ImportMetaEnv {
  readonly VITE_BASE44_APP_ID?: string;
  readonly VITE_BASE44_FUNCTIONS_VERSION?: string;
  readonly VITE_BASE44_APP_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
