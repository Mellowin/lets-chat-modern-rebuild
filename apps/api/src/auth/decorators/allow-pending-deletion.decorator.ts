import { SetMetadata } from '@nestjs/common';
import { ALLOW_PENDING_DELETION } from '../guards/jwt-access.guard';

/**
 * Allow authenticated users in PENDING_DELETION status to access the decorated
 * route. This is required for the account-deletion request retry endpoint,
 * where a client may retry the request after the account was already marked for
 * deletion but the original HTTP response was lost.
 */
export const AllowPendingDeletion = () =>
  SetMetadata(ALLOW_PENDING_DELETION, true);
