import {
  StandardSchemaValidationPipe,
  type StandardSchemaValidationPipeOptions,
} from '@nestjs/common';
import { AppException } from './errors/app.exception.js';

export type ValidationIssue = { path: string; message: string };

type SchemaIssue = Parameters<
  NonNullable<StandardSchemaValidationPipeOptions['exceptionFactory']>
>[0][number];

export function createValidationPipe() {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues) =>
      new AppException('VALIDATION_ERROR', undefined, {
        issues: issues.map(toValidationIssue),
      }),
  });
}

function toValidationIssue(issue: SchemaIssue): ValidationIssue {
  const path = (issue.path ?? [])
    .map((segment) =>
      String(typeof segment === 'object' ? segment.key : segment),
    )
    .join('.');
  return { path, message: issue.message };
}
