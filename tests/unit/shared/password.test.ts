import { getDummyHash, hashPassword, verifyPassword } from '../../../src/shared/password';

describe('password', () => {
  it('should hash using scrypt with a random salt', async () => {
    const [first, second] = await Promise.all([
      hashPassword('senha-super-forte'),
      hashPassword('senha-super-forte'),
    ]);

    expect(first).toMatch(/^scrypt\$32768\$8\$1\$[^$]+\$[^$]+$/);
    expect(first).not.toBe(second);
    expect(first).not.toContain('senha-super-forte');
  });

  it('should verify the correct password', async () => {
    const hash = await hashPassword('senha-super-forte');
    await expect(verifyPassword('senha-super-forte', hash)).resolves.toBe(true);
  });

  it('should reject a wrong password', async () => {
    const hash = await hashPassword('senha-super-forte');
    await expect(verifyPassword('senha-errada-123', hash)).resolves.toBe(false);
  });

  it.each([
    ['empty string', ''],
    ['unknown algorithm', 'bcrypt$1$2$3$c2FsdA==$aGFzaA=='],
    ['wrong number of parts', 'scrypt$32768$8$1$c2FsdA=='],
    ['non numeric params', 'scrypt$abc$8$1$c2FsdA==$aGFzaA=='],
    ['wrong key length', 'scrypt$1024$8$1$c2FsdA==$aGFzaA=='],
  ])('should return false for a malformed hash (%s)', async (_label, stored) => {
    await expect(verifyPassword('qualquer', stored)).resolves.toBe(false);
  });

  it('should reuse the same dummy hash across calls', async () => {
    const [a, b] = await Promise.all([getDummyHash(), getDummyHash()]);
    expect(a).toBe(b);
    await expect(verifyPassword('qualquer', a)).resolves.toBe(false);
  });
});
