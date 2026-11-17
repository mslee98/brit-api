import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

import {
  buildOperationsCanonical,
  signOperationsRequest,
} from './utils/partner-operations-hmac.util';
import { PartnerExternalResultStatus } from './domain/enums/partner-external-result-status.enum';

export type PartnerOperationsCallInput = {
  baseUrl: string;
  method: 'POST' | 'GET';
  pathWithQuery: string;
  rawBody: string;
  signingSecret: string;
  keyId: string;
  timeoutMs?: number;
};

export type PartnerOperationsParsedBody = {
  exchangeId?: string;
  partnerTransactionId?: string | null;
  status?: string;
  processedAt?: string | null;
};

export type PartnerOperationsCallResult = {
  requestId: string;
  httpStatus: number | null;
  ok: boolean;
  partnerStatus: PartnerExternalResultStatus;
  partnerTransactionId: string | null;
  rawSnippet: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

const DEFAULT_TIMEOUT_MS = 8_000;
const TIMESTAMP_HEADER = 'X-Brit-Timestamp';
const REQUEST_ID_HEADER = 'X-Brit-Request-Id';
const KEY_ID_HEADER = 'X-Brit-Key-Id';
const SIGNATURE_HEADER = 'X-Brit-Signature';

function mapPartnerStatus(raw: string | undefined): PartnerExternalResultStatus {
  switch ((raw ?? '').toUpperCase()) {
    case 'SUCCEEDED':
      return PartnerExternalResultStatus.SUCCEEDED;
    case 'FAILED':
      return PartnerExternalResultStatus.FAILED;
    case 'PROCESSING':
      return PartnerExternalResultStatus.PROCESSING;
    case 'NOT_FOUND':
      return PartnerExternalResultStatus.NOT_FOUND;
    case 'UNKNOWN':
      return PartnerExternalResultStatus.UNKNOWN;
    default:
      return PartnerExternalResultStatus.UNKNOWN;
  }
}

/**
 * 업체 Operations HTTP만 담당. 원장·수수료 로직 금지.
 */
@Injectable()
export class PartnerOperationsClient {
  private readonly logger = new Logger(PartnerOperationsClient.name);

  async call(input: PartnerOperationsCallInput): Promise<PartnerOperationsCallResult> {
    const requestId = randomUUID();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const canonical = buildOperationsCanonical({
      method: input.method,
      pathWithQuery: input.pathWithQuery,
      timestamp,
      requestId,
      rawBody: input.rawBody,
    });
    const signature = signOperationsRequest(input.signingSecret, canonical);
    const url = `${input.baseUrl.replace(/\/$/, '')}${input.pathWithQuery}`;
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: input.method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          [KEY_ID_HEADER]: input.keyId,
          [TIMESTAMP_HEADER]: timestamp,
          [REQUEST_ID_HEADER]: requestId,
          [SIGNATURE_HEADER]: signature,
        },
        body: input.method === 'GET' ? undefined : input.rawBody,
        signal: controller.signal,
        redirect: 'error',
      });

      const text = await response.text();
      let parsed: PartnerOperationsParsedBody = {};
      try {
        parsed = text ? (JSON.parse(text) as PartnerOperationsParsedBody) : {};
      } catch {
        parsed = {};
      }

      if (!response.ok) {
        return {
          requestId,
          httpStatus: response.status,
          ok: false,
          partnerStatus: PartnerExternalResultStatus.UNKNOWN,
          partnerTransactionId: null,
          rawSnippet: text.slice(0, 200) || null,
          errorCode: 'OPERATIONS_HTTP_ERROR',
          errorMessage: `HTTP ${response.status}`,
        };
      }

      const partnerStatus = mapPartnerStatus(parsed.status);
      return {
        requestId,
        httpStatus: response.status,
        ok: true,
        partnerStatus,
        partnerTransactionId:
          typeof parsed.partnerTransactionId === 'string'
            ? parsed.partnerTransactionId
            : null,
        rawSnippet: null,
        errorCode: null,
        errorMessage: null,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'OPERATIONS_TRANSPORT_ERROR';
      this.logger.warn(`Operations call failed: ${message}`);
      return {
        requestId,
        httpStatus: null,
        ok: false,
        partnerStatus: PartnerExternalResultStatus.UNKNOWN,
        partnerTransactionId: null,
        rawSnippet: null,
        errorCode: 'OPERATIONS_TRANSPORT_ERROR',
        errorMessage: message.slice(0, 500),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
