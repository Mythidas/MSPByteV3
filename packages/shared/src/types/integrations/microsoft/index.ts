export type MSGraphError = {
  error: {
    code: string;
    message: string;
    innerError?: any;
  };
};
