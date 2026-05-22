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
