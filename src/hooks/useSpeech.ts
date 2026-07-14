import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/commands";
import type { VoiceRuleDto } from "../bindings/VoiceRuleDto";

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

/**
 * Import a model file from disk.
 *
 * The copy is a Job, so — like a download — the promise resolves when it *finishes*; the progress the
 * user watches comes from the job list. On settle, the catalogue is refreshed so the new model appears.
 */
export function useImportModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => api.importModel(path),
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

/**
 * The built-in voice commands for the current recognition language (ADR-PROJ-010).
 *
 * SSOT with the engine: the reference shows exactly the phrases the recogniser acts on. Re-fetched when
 * the recognition language changes, since the phrases are language-specific.
 */
export function useBuiltinCommands() {
  return useQuery({
    queryKey: ["builtin-commands"],
    queryFn: api.listBuiltinCommands,
    staleTime: 60_000,
  });
}

/** Replace the whole voice-command list (the editor sends the full array). */
export function useSetRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rules: VoiceRuleDto[]) => api.setRules(rules),
    onSuccess: (settings) => qc.setQueryData(["settings"], settings),
  });
}

/** Turn spoken punctuation on or off. */
export function useSetDictatePunctuation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => api.setDictatePunctuation(enabled),
    onSuccess: (settings) => qc.setQueryData(["settings"], settings),
  });
}
