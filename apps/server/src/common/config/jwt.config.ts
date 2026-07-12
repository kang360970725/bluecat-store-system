import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET || 'change_me',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'change_me_too',
  expiresIn: '2h',
  refreshExpiresIn: '14d'
}));
