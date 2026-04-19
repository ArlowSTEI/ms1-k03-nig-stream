import { z } from 'zod';

export const UserIdPayload = z.object({
  data: z.object({
    id: z.number(),
  }),
});

export const UserInFamilyPayload = z.object({
  data: z.object({
    isMember: z.number(),
  }),
});