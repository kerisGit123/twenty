import { CoreApiClient } from 'twenty-client-sdk/core';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';

// Server functions act as the app itself, not as the person who triggered
// them. Staff have no direct access to the rental tables, so routes check the
// caller's workspaces (see scope.ts) and then read and write through these.
export const appClient = () => new CoreApiClient({ runAs: 'application' });

export const appMetadataClient = () => new MetadataApiClient({ runAs: 'application' });
