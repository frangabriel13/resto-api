// El body de las subidas, para el OpenAPI (multer no lo describe solo).
export const IMAGE_FILE_BODY = {
  schema: {
    type: 'object' as const,
    properties: { file: { type: 'string' as const, format: 'binary' } },
    required: ['file'],
  },
};
