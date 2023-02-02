export interface Bus {
  address: number;
  data: number;
  isWrite: boolean;
}

export function newBus(): Bus {
  return {
    address: 0,
    data: 0,
    isWrite: false,
  };
}
