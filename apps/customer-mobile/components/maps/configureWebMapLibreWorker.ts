import { getVersion, setWorkerUrl } from 'maplibre-gl';

let configured = false;

export function configureWebMapLibreWorker(): void {
  if (configured) return;
  setWorkerUrl(
    `https://unpkg.com/maplibre-gl@${getVersion()}/dist/maplibre-gl-worker.mjs`,
  );
  configured = true;
}
