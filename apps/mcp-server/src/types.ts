export interface Product {
  id: string;
  name: string;
  url: string;
  shortDescription: string;
  overview?: string;
  category: string;
  targetCustomers?: string[];
  businessProblem?: string;
  keyFeatures: string[];
  advancedFeatures?: string[];
  technologyScope?: string[];
  platformsSupported?: string[];
  integrations?: string[];
  complianceStandards?: string[];
  businessBenefits?: string[];
  useCases?: string[];
  deploymentType?: ("Cloud" | "Web" | "Mobile" | "On-Premise")[];
}

export interface ProductCatalog {
  source: string;
  lastUpdated: string;
  products: Product[];
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description?: string | undefined }>;
    required?: string[];
  };
  title?: string;
  outputSchema?: {
    type: "object";
    properties: Record<string, { type: string; description?: string | undefined }>;
    required?: string[];
  };
  annotations?: Record<string, unknown>;
}

export interface McpRequest {
  tool: string;
  arguments?: Record<string, unknown>;
}

export interface McpResponse<T = unknown> {
  ok: boolean;
  tool: string;
  data?: T;
  error?: string;
}
