// Build-time env toggles — NEXT_PUBLIC_ vars are inlined at build time, so
// flipping one requires a redeploy, not just a config change. Default on:
// unset or anything other than the literal string "false" is treated as
// enabled, so existing deployments that predate a given flag keep working.

/** Gates the pipeline sheet's drag-between-stages trigger on the Job Orders table (see PipelineSheetTrigger). */
export const isPipelineDragEnabled = process.env.NEXT_PUBLIC_FEATURE_PIPELINE_DRAG !== 'false';
