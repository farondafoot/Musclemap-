import type { IChainAdapter } from "@/types";

export type { IChainAdapter };

/**
 * Registry mapping chain identifiers to their adapter instance.
 * Add Ethereum / Base adapters here when ready.
 */
export class ChainAdapterRegistry {
  private adapters = new Map<string, IChainAdapter>();

  register(adapter: IChainAdapter): void {
    this.adapters.set(adapter.chain, adapter);
  }

  get(chain: string): IChainAdapter | undefined {
    return this.adapters.get(chain);
  }

  getAll(): IChainAdapter[] {
    return [...this.adapters.values()];
  }
}
