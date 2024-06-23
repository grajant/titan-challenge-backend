import { z } from 'zod';

const Results = z
  .object({
    number: z.string(),
    addresses: z.array(
      z.object({
        address_purpose: z.union([z.literal('LOCATION'), z.literal('MAILING')]),
        address_1: z.string(),
        city: z.string(),
        state: z.string(),
        postal_code: z.string(),
        telephone_number: z.string().optional(),
      }),
    ),
    basic: z.object({
      first_name: z.string(),
      last_name: z.string(),
    }),
    taxonomies: z.array(
      z.object({
        code: z.string(),
        desc: z.string().nullable(),
      }),
    ),
  })
  .transform(({ number, basic, taxonomies, addresses }) => {
    const locationAddress = addresses.find(({ address_purpose }) => address_purpose === 'LOCATION');

    return {
      id: number,
      fullName: `${basic.first_name} ${basic.last_name}`,
      specialty: taxonomies[0].desc,
      address: {
        street: locationAddress?.address_1,
        city: locationAddress?.city,
        state: locationAddress?.state,
      },
      telephoneNumber: locationAddress?.telephone_number,
    };
  });

export const npiSchema = z.object({
  results: z.array(Results),
  result_count: z.number(),
});

export type NPIResult = z.input<typeof Results>;
export type NPIResults = Array<z.infer<typeof Results>>;
