/**
 * Lazy loader for pdf.js.
 *
 * pdfjs-dist is ~330 kB (minified) plus a ~1.4 MB worker file. Loading it
 * dynamically on first use keeps it out of the initial bundle. The worker
 * configuration (GlobalWorkerOptions.workerSrc) is set up as part of the
 * dynamic path so components only need to call loadPdfjs().
 */
export type PdfjsModule = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfjsModule> | null = null;

export function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
      .then(([pdfjs, worker]) => {
        // Configure the worker once, together with the library itself
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        return pdfjs;
      })
      .catch((error) => {
        // Reset so a later call can retry (e.g. after a network hiccup)
        pdfjsPromise = null;
        throw error;
      });
  }
  return pdfjsPromise;
}
