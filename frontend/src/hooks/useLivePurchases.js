import { useEffect, useState } from 'react';
import { getLivePurchaseStatus } from '../services/billingService.js';

export default function useLivePurchases() {
  const [status, setStatus] = useState({ available: false, seatsAvailable: false });
  useEffect(() => {
    const controller = new AbortController();
    getLivePurchaseStatus(controller.signal).then(result => {
      if (!controller.signal.aborted) setStatus(result);
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  return status;
}
