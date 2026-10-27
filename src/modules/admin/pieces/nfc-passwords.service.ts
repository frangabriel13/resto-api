import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.js';
import type { Piece, Prisma } from '../../../generated/prisma/client.js';
import {
  decryptNfcPassword,
  encryptNfcPassword,
  generateNfcPassword,
  parseNfcPasswordKey,
} from '../../pieces/nfc-password.js';

type NfcPasswordDb = Pick<Prisma.TransactionClient, 'pieceNfcPassword'>;
type PieceRef = Pick<Piece, 'id' | 'merchantId'>;

@Injectable()
export class NfcPasswordsService {
  private readonly key: Buffer;

  constructor(config: ConfigService<Env, true>) {
    this.key = parseNfcPasswordKey(
      config.get('NFC_PASSWORD_KEY', { infer: true }),
    );
  }

  async create(db: NfcPasswordDb, piece: PieceRef) {
    await db.pieceNfcPassword.create({ data: this.newRow(piece) });
  }

  // Las piezas anteriores a la contraseña la reciben la primera vez que se
  // pide; si dos pedidos llegan a la vez, el segundo lee la del primero.
  async reveal(db: NfcPasswordDb, piece: PieceRef) {
    const { count } = await db.pieceNfcPassword.createMany({
      data: [this.newRow(piece)],
      skipDuplicates: true,
    });
    const { encrypted } = await db.pieceNfcPassword.findUniqueOrThrow({
      where: { pieceId: piece.id },
    });
    return {
      password: decryptNfcPassword(this.key, piece.id, encrypted),
      generated: count === 1,
    };
  }

  private newRow({ id, merchantId }: PieceRef) {
    return {
      pieceId: id,
      merchantId,
      encrypted: encryptNfcPassword(this.key, id, generateNfcPassword()),
    };
  }
}
