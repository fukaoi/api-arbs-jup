import dotenv from 'dotenv';
import bs58 from 'bs58';
import { Connection, Keypair, Transaction } from '@solana/web3.js';
import { Wallet } from '@project-serum/anchor';

import { getTransaction } from './utils.mjs';

console.log({ dotenv });
dotenv.config();

// This is a free Solana RPC endpoint. It may have ratelimit and sometimes
// invalid cache. I will recommend using a paid RPC endpoint.
const connection = new Connection('https://solana-api.projectserum.com');
const wallet = new Wallet(
  Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY || '')),
);

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
// require wsol to start trading, this function create your wsol account and fund 1 SOL to it
await createWSolAccount();

// initial 20 USDC for quote
const initial = 20_000_000;

while (true) {
  // 0.1 SOL
  const usdcToSol = await getCoinQuote(USDC_MINT, SOL_MINT, initial);

  const solToUsdc = await getCoinQuote(
    SOL_MINT,
    USDC_MINT,
    usdcToSol.data[0].outAmount,
  );

  // when outAmount more than initial
  if (solToUsdc.data[0].outAmount > initial) {
    await Promise.all(
      [usdcToSol.data[0], solToUsdc.data[0]].map(async (route) => {
        const { setupTransaction, swapTransaction, cleanupTransaction } =
          await getTransaction(route);

        await Promise.all(
          [setupTransaction, swapTransaction, cleanupTransaction]
            .filter(Boolean)
            .map(async (serializedTransaction) => {
              // get transaction object from serialized transaction
              const transaction = Transaction.from(
                Buffer.from(serializedTransaction, 'base64'),
              );
              // perform the swap
              // Transaction might failed or dropped
              const txid = await connection.sendTransaction(
                transaction,
                [wallet.payer],
                {
                  skipPreflight: true,
                },
              );
              try {
                await getConfirmTransaction(txid);
                console.log(`Success: https://solscan.io/tx/${txid}`);
              } catch (e) {
                console.log(`Failed: https://solscan.io/tx/${txid}`);
              }
            }),
        );
      }),
    );
  }
}
