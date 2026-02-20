-- Add graph_config column to agents table for storing visual builder graph data
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS graph_config JSONB DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN public.agents.graph_config IS 'Stores the visual agent builder graph (nodes, edges) as JSON';