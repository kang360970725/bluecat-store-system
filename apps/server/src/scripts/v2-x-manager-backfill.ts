import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { V2OperationsService } from '../modules/v2-operations/v2-operations.service';

async function main() {
  const [start, end] = process.argv.slice(2);
  if (!start || !end) throw new Error('Usage: pnpm --filter @bluecat/server v2:backfill YYYY-MM-DD YYYY-MM-DD');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    const result = await app.get(V2OperationsService).backfillCollector(start, end);
    console.log(JSON.stringify(result));
  } finally { await app.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
