import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { INSIGHTS_DATASETS } from "../insights";

const OPERATORS = ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in"] as const;

export default defineTool({
  name: "query_insights_dataset",
  title: "Query any Insights source dataset",
  description:
    `Read-only escape hatch: query any platform dataset directly when no purpose-built tool covers the question. Allowed datasets: ${INSIGHTS_DATASETS.join(", ")}. Supply optional column selection (defaults to ALL columns), filters (column + operator + value), ordering, limit and offset. Results are paginated and the response reports total_count, returned, offset, next_offset and has_more — keep calling with next_offset until has_more is false, otherwise you are looking at a partial set. Use describe_schema to learn the available column names. Everything runs through the signed-in user's row-level security, so results match exactly what that user sees in the UI. Aggregate the returned rows yourself.`,
  },
});
