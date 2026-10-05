import { type CoreApiClient } from 'twenty-client-sdk/core';

import { toE164, type TenantPhone } from 'src/logic-functions/utils/whatsapp';

// ---------------------------------------------------------------- WhatsApp link

// Keeps a person's WhatsApp click-to-chat link in step with their phone.
export const syncWhatsappLink = async (client: CoreApiClient, personId: string) => {
  const { people } = await client.query({
    people: {
      __args: { filter: { id: { eq: personId } }, first: 1 },
      edges: {
        node: {
          id: true,
          phones: { primaryPhoneNumber: true, primaryPhoneCallingCode: true },
          whatsapp: { primaryLinkUrl: true },
        },
      },
    },
  });
  const person = people?.edges?.[0]?.node;

  if (!person) return;

  const number = toE164(person.phones as TenantPhone);
  const url = number ? `https://wa.me/${number.replace('+', '')}` : '';

  if ((person.whatsapp?.primaryLinkUrl ?? '') === url) return;

  await client.mutation({
    updatePerson: {
      __args: {
        id: person.id,
        data: { whatsapp: { primaryLinkUrl: url, primaryLinkLabel: url ? 'Chat on WhatsApp' : '', secondaryLinks: [] } },
      },
      id: true,
    },
  });
};

// ---------------------------------------------------------------- owners

// The Personal workspace: where anything without a workspace goes. Created on
// first use.
export const personalOwnerId = async (client: CoreApiClient): Promise<string> => {
  const { owners } = await client.query({
    owners: {
      __args: { filter: { ownerType: { eq: 'PERSONAL' } }, orderBy: [{ createdAt: 'AscNullsLast' }], first: 1 },
      edges: { node: { id: true } },
    },
  });
  const existing = owners?.edges?.[0]?.node?.id;

  if (existing) return existing;

  const { createOwner } = await client.mutation({
    createOwner: { __args: { data: { name: 'Personal', ownerType: 'PERSONAL' } }, id: true },
  });

  return createOwner?.id as string;
};

// A team member's own Personal workspace (they host it), created on first use.
export const memberPersonalOwnerId = async (client: CoreApiClient, memberId: string, name: string): Promise<string> => {
  const { memberships } = await client.query({
    memberships: {
      __args: { filter: { memberId: { eq: memberId }, memberRole: { eq: 'HOST' } }, first: 100 },
      edges: { node: { owner: { id: true, ownerType: true } } },
    },
  });
  const existing = (memberships?.edges ?? []).find(({ node }) => (node.owner?.ownerType as string | null) === 'PERSONAL');

  if (existing?.node.owner?.id) return existing.node.owner.id;

  const { createOwner } = await client.mutation({
    createOwner: { __args: { data: { name: 'Personal', ownerType: 'PERSONAL' } }, id: true },
  });
  const ownerId = createOwner?.id as string;

  await client.mutation({
    createMembership: { __args: { data: { ownerId, memberId, name, memberRole: 'HOST' } }, id: true },
  });

  return ownerId;
};

export const propertyOwnerId = async (client: CoreApiClient, propertyId?: string | null) => {
  if (!propertyId) return null;

  const { properties } = await client.query({
    properties: {
      __args: { filter: { id: { eq: propertyId } }, first: 1 },
      edges: { node: { ownerId: true } },
    },
  });

  return properties?.edges?.[0]?.node?.ownerId ?? null;
};

// An expense without a workspace takes its property's, else Personal.
export const fillExpenseOwner = async (client: CoreApiClient, expenseId: string) => {
  const { expenses } = await client.query({
    expenses: {
      __args: { filter: { id: { eq: expenseId } }, first: 1 },
      edges: { node: { id: true, ownerId: true, propertyId: true } },
    },
  });
  const expense = expenses?.edges?.[0]?.node;

  if (!expense || expense.ownerId) return;

  const ownerId = (await propertyOwnerId(client, expense.propertyId)) ?? (await personalOwnerId(client));

  await client.mutation({ updateExpense: { __args: { id: expense.id, data: { ownerId } }, id: true } });
};

// A new property without a workspace goes to Personal.
export const fillPropertyOwner = async (client: CoreApiClient, propertyId: string) => {
  const { properties } = await client.query({
    properties: {
      __args: { filter: { id: { eq: propertyId } }, first: 1 },
      edges: { node: { id: true, ownerId: true } },
    },
  });
  const property = properties?.edges?.[0]?.node;

  if (!property || property.ownerId) return;

  await client.mutation({
    updateProperty: { __args: { id: property.id, data: { ownerId: await personalOwnerId(client) } }, id: true },
  });
};

// A new document without a workspace takes its property's, else Personal.
export const fillDocumentOwner = async (client: CoreApiClient, documentId: string) => {
  const { documents } = await client.query({
    documents: {
      __args: { filter: { id: { eq: documentId } }, first: 1 },
      edges: { node: { id: true, ownerId: true, propertyId: true } },
    },
  });
  const document = documents?.edges?.[0]?.node;

  if (!document || document.ownerId) return;

  const ownerId = (await propertyOwnerId(client, document.propertyId)) ?? (await personalOwnerId(client));

  await client.mutation({ updateDocument: { __args: { id: document.id, data: { ownerId } }, id: true } });
};

// When a property moves to a workspace, its payments and expenses that were
// unassigned or in Personal follow it (ones already in another workspace stay).
export const backfillPropertyOwner = async (client: CoreApiClient, propertyId: string) => {
  const ownerId = await propertyOwnerId(client, propertyId);

  if (!ownerId) return;

  const personalId = await personalOwnerId(client);

  // Contracts always follow their property.
  const { rentals } = await client.query({
    rentals: {
      __args: { filter: { propertyId: { eq: propertyId } }, first: 200 },
      edges: { node: { id: true, ownerId: true } },
    },
  });

  for (const { node } of (rentals?.edges ?? []).filter((edge) => edge.node.ownerId !== ownerId)) {
    await client.mutation({ updateRental: { __args: { id: node.id, data: { ownerId } }, id: true } });
  }
  const unassigned = { or: [{ ownerId: { is: 'NULL' as const } }, { ownerId: { eq: personalId } }] };

  const { rentPayments } = await client.query({
    rentPayments: {
      __args: { filter: { propertyId: { eq: propertyId }, ...unassigned }, first: 200 },
      edges: { node: { id: true, ownerId: true } },
    },
  });

  for (const { node } of (rentPayments?.edges ?? []).filter((edge) => edge.node.ownerId !== ownerId)) {
    await client.mutation({ updateRentPayment: { __args: { id: node.id, data: { ownerId } }, id: true } });
  }

  const { expenses } = await client.query({
    expenses: {
      __args: { filter: { propertyId: { eq: propertyId }, ...unassigned }, first: 200 },
      edges: { node: { id: true, ownerId: true } },
    },
  });

  for (const { node } of (expenses?.edges ?? []).filter((edge) => edge.node.ownerId !== ownerId)) {
    await client.mutation({ updateExpense: { __args: { id: node.id, data: { ownerId } }, id: true } });
  }
};
