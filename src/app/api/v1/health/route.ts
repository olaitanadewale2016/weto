import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await connectDB();
    const state = mongoose.connection.readyState;
    if (state !== 1) {
      return NextResponse.json(
        { status: 'error', db: 'disconnected', readyState: state },
        { status: 503 }
      );
    }

    return NextResponse.json({
      status: 'ok',
      db: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: 'error',
        db: 'error',
        message: err instanceof Error ? err.message : 'Health check failed',
      },
      { status: 503 }
    );
  }
}
