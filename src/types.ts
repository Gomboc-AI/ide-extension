// types file

export type IACScanContent = {
  filePath: string;
  fileContents: string;
};

export type SecurityPolicy = {
  id: string;
  capabilityId: string;
  metaData: {
    framework: string;
    identifier: string;
    description: string;
    createdBy: string;
    createdAt: string;
  };
};
