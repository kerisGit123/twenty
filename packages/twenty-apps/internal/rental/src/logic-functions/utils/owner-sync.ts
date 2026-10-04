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

// An expense with a property but no owner takes the property's owner.
export const fillExpenseOwner = async (client: CoreApiClient, expenseId: string) => {
  const { expenses } = await client.query({
    expenses: {
      __args: { filter: { id: { eq: expenseId } }, first: 1 },
      edges: { node: { id: true, ownerId: true, propertyId: true } },
    },
  });
  const expense = expenses?.edges?.[0]?.node;

  if (!expense || expense.ownerId || !expense.propertyId) return;

  const ownerId = await propertyOwnerId(client, expense.propertyId);

  if (ownerId) {
    await client.mutation({ updateExpense: { __args: { id: expense.id, data: { ownerId } }, id: true } });
  }
};

// When a property gets an owner, its payments and expenses that don't have
// one yet are assigned to it (existing assignments are left alone).
export const backfillPropertyOwner = async (client: CoreApiClient, propertyId: string) => {
  const ownerId = await propertyOwnerId(client, propertyId);

  if (!ownerId) return;

  const { rentPayments } = await client.query({
    rentPayments: {
      __args: { filter: { propertyId: { eq: propertyId }, ownerId: { is: 'NULL' } }, first: 200 },
      edges: { node: { id: true } },
    },
  });

  for (const { node } of rentPayments?.edges ?? []) {
    await client.mutation({ updateRentPayment: { __args: { id: node.id, data: { ownerId } }, id: true } });
  }

  const { expenses } = await client.query({
    expenses: {
      __args: { filter: { propertyId: { eq: propertyId }, ownerId: { is: 'NULL' } }, first: 200 },
      edges: { node: { id: true } },
    },
  });

  for (const { node } of expenses?.edges ?? []) {
    await client.mutation({ updateExpense: { __args: { id: node.id, data: { ownerId } }, id: true } });
  }
};
