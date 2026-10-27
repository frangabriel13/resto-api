import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { deriveKey } from '../../common/crypto.js';
import type { Env } from '../../config/env.js';
import { decryptNfcPassword, encryptNfcPassword } from './nfc-password.js';

// La clave es una subclave de SECRET_KEY (como stamp-token y otp), nunca un
// secreto propio: no hace falta una variable de entorno nueva.
@Injectable()
export class NfcPasswordService {
  private readonly key: Buffer;

  constructor(config: ConfigService<Env, true>) {
    this.key = deriveKey(
      config.get('SECRET_KEY', { infer: true }),
      'piece.nfc_password',
    );
  }

  encrypt(plainPassword: string): string {
    return encryptNfcPassword(this.key, plainPassword);
  }

  decrypt(encrypted: string): string {
    return decryptNfcPassword(this.key, encrypted);
  }
}
