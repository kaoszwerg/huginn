import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/commands";

/**
 * The microphones the system offers.
 *
 * Not cached for long: a headset plugged in after the app started must appear, and one that was
 * unplugged must stop being offered as a choice that would silently fail.
 */
export function useMicrophones() {
  return useQuery({
    queryKey: ["microphones"],
    queryFn: api.listMicrophones,
    staleTime: 5_000,
  });
}

/** Choose the microphone. `null` is the system default. */
export function useSetMicrophone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string | null) => api.setMicrophone(name),
    onSuccess: (settings) => qc.setQueryData(["settings"], settings),
  });
}

/** The model catalogue, annotated with what is installed. */
export function useModels() {
  return useQuery({
    queryKey: ["models"],
    queryFn: api.listModels,
    // A download finishing changes this, and the download is a Job — so the job poll invalidates it.
    staleTime: 2_000,
  });
}

/**
 * Download a model.
 *
 * The mutation resolves when the download *finishes* (minutes), so the UI does not wait on it — the
 * progress the user watches comes from the job list. What this promise is good for is knowing when to
 * refresh the catalogue, and for surfacing a failure (a checksum mismatch, a dead network).
 */
export function useDownloadModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.downloadModel(id),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["models"] });
      void qc.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

/** Choose the model that recognises speech. Loads it into the worker. */
export function useSetModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.setModel(id),
    onSuccess: (settings) => {
      qc.setQueryData(["settings"], settings);
      void qc.invalidateQueries({ queryKey: ["models"] });
    },
  });
}

/** Turn the recording sounds on or off. */
export function useSetSounds() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => api.setSounds(enabled),
    onSuccess: (settings) => qc.setQueryData(["settings"], settings),
  });
}
