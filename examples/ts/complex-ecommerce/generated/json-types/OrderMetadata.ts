export type OrderMetadata = {
  source: string;
  campaign: string;
  attribution: {
    utm_source: string;
    utm_medium: string;
    utm_campaign?: string;
  };
};
