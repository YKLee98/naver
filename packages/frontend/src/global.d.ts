declare global {
  interface Window {
    gtag?: (
      type: string,
      event: string,
      options: {
        event_category?: string;
        event_label?: string;
        value?: number;
        metric_name?: string;
        metric_value?: number;
      }
    ) => void;
  }
}

export {};