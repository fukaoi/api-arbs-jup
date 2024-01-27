import dotenv from 'dotenv';
import bs58 from 'bs58';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import got from 'got';
import { Wallet } from '@project-serum/anchor';
import promiseRetry from 'promise-retry';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';


// This is a free Solana RPC endpoint. It may have ratelimit and sometimes
// invalid cache. I will recommend using a paid RPC endpoint.
const connection = new Connection('https://solana-api.projectserum.com');
const wallet = new Wallet(
  Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY || '')),
);

const SOL_MINT = 'So11111111111111111111111111111111111111112';

// wsol account
export const createWSolAccount = async () => {
  const wsolAddress = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    new PublicKey(SOL_MINT),
    wallet.publicKey,
  );

  const wsolAccount = await connection.getAccountInfo(wsolAddress);

  if (!wsolAccount) {
    const transaction = new Transaction({
      feePayer: wallet.publicKey,
    });
    const instructions = [];

    instructions.push(
      await Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        new PublicKey(SOL_MINT),
        wsolAddress,
        wallet.publicKey,
        wallet.publicKey,
      ),
    );

    // fund 1 sol to the account
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: wsolAddress,
        lamports: 1_000_000_000, // 1 sol
      }),
    );

    instructions.push(
      // This is not exposed by the types, but indeed it exists
      Token.createSyncNativeInstruction(TOKEN_PROGRAM_ID, wsolAddress),
    );

    transaction.add(...instructions);
    transaction.recentBlockhash = await (
      await connection.getRecentBlockhash()
    ).blockhash;
    transaction.partialSign(wallet.payer);
    const result = await connection.sendTransaction(transaction, [
      wallet.payer,
    ]);
    console.log({ result });
  }

  return wsolAccount;
};

export const getCoinQuote = (inputMint, outputMint, amount) =>
  got
    .get(
      `https://quote-api.jup.ag/v1/quote?outputMint=${outputMint}&inputMint=${inputMint}&amount=${amount}&slippage=0.2`,
    )
    .json();

export const getTransaction = (route) => {
  return got
    .post('https://quote-api.jup.ag/v1/swap', {
      json: {
        route: route,
        userPublicKey: wallet.publicKey.toString(),
        // to make sure it doesnt close the sol account
        wrapUnwrapSOL: false,
      },
    })
    .json();
};

export const getConfirmTransaction = async (txid) => {
  const res = await promiseRetry(
    async (retry, attempt) => {
      let txResult = await connection.getTransaction(txid, {
        commitment: 'confirmed',
      });

      if (!txResult) {
        const error = new Error('Transaction was not confirmed');
        error.txid = txid;

        retry(error);
        return;
      }
      return txResult;
    },
    {
      retries: 40,
      minTimeout: 500,
      maxTimeout: 1000,
    },
  );
  if (res.meta.err) {
    throw new Error('Transaction failed');
  }
  return txid;
};
