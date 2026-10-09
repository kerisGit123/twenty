import { type SyntheticEvent } from 'react';

// The value of a Twenty input's change event (custom elements put it in
// detail.value, plain inputs in target.value).
export const readValue = (event: SyntheticEvent<HTMLElement>): string => {
  const object = event as unknown as { detail?: { value?: string }; target?: { value?: string } };

  return object.detail?.value ?? object.target?.value ?? '';
};
