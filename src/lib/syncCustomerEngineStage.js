import { base44 } from "@/api/base44Client";

/**
 * Syncs a CustomerEngine's current_stage based on its most recent build's spec sheet.
 * Should be called before displaying the engine's stage to ensure accuracy.
 * Returns the updated engine record.
 */
export async function syncCustomerEngineStage(engineId) {
  if (!engineId) return null;

  try {
    const engines = await base44.entities.CustomerEngine.filter({ id: engineId });
    const engine = engines?.[0];
    if (!engine) return null;

    // Fetch most recent build for this engine
    const builds = await base44.entities.EngineBuild.filter({ 
      customer_engine_id: engineId 
    });
    
    if (builds && builds.length > 0) {
      const mostRecentBuild = builds.sort((a, b) => 
        new Date(b.created_date || 0) - new Date(a.created_date || 0)
      )[0];

      if (mostRecentBuild?.spec_sheet_id) {
        const specs = await base44.entities.SpecSheet.filter({ 
          id: mostRecentBuild.spec_sheet_id 
        });
        if (specs?.[0]?.spec_type && engine.current_stage !== specs[0].spec_type) {
          // Update stage if it changed
          await base44.entities.CustomerEngine.update(engineId, { 
            current_stage: specs[0].spec_type 
          });
          return { ...engine, current_stage: specs[0].spec_type };
        }
      }
    }

    return engine;
  } catch (e) {
    console.warn("Failed to sync CustomerEngine stage:", e);
    return null;
  }
}