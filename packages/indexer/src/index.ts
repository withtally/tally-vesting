import { ponder } from "ponder:registry";
import { account, transferEvent } from "../ponder.schema";

ponder.on("ERC20:Transfer", async ({ event, context }) => {
  const { from, to, value } = event.args;
  const { db } = context;

  // Create transfer event record
  await db.insert(transferEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    from,
    to,
    value,
    timestamp: Number(event.block.timestamp),
    blockNumber: event.block.number,
  });

  // Update sender balance (if not zero address)
  if (from !== "0x0000000000000000000000000000000000000000") {
    await db
      .insert(account)
      .values({
        address: from,
        balance: 0n,
        transferCount: 1,
      })
      .onConflictDoUpdate((row) => ({
        balance: row.balance - value,
        transferCount: row.transferCount + 1,
      }));
  }

  // Update receiver balance
  await db
    .insert(account)
    .values({
      address: to,
      balance: value,
      transferCount: 1,
    })
    .onConflictDoUpdate((row) => ({
      balance: row.balance + value,
      transferCount: row.transferCount + 1,
    }));
});
