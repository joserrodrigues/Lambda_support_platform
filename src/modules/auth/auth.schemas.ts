import { z } from 'zod';
import { emailSchema, publicUserSchema } from '../users/user.schemas';

export const loginBodySchema = z
  .strictObject({
    email: emailSchema,
    // No login não validamos tamanho mínimo para não revelar a política de senha.
    password: z.string().min(1).max(128),
  })
  .meta({ id: 'LoginRequest' });

export const loginResponseSchema = z
  .object({
    accessToken: z.string(),
    tokenType: z.literal('Bearer'),
    expiresIn: z.number().int(),
    user: publicUserSchema,
  })
  .meta({ id: 'LoginResponse' });

export type LoginBody = z.infer<typeof loginBodySchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
