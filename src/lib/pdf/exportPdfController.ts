import { supabase } from "@/integrations/supabase/client";
import { getScriptFromText } from "./pdfTypographyConfig";
import { fetchRequiredLocalFonts, bufferToBase64 } from "./fontLoader";
import { generateDocumentDefinition, RenderData } from "./tableRenderer";

/**
 * Controller to fetch user data, initialize PDF libraries securely, load fonts,
 * and download the final vectorized, script-accurate PDF document.
 * 
 * @async
 * @function startPdfExport
 * @param {string} userId - The unique identifier of the user exporting data.
 * @param {string} userEmail - The user's email for the document header.
 * @returns {Promise<Blob>} A Blob representing the generated PDF file.
 */
export const startPdfExport = async (userId: string, userEmail: string): Promise<Blob> => {
    try {
        // 1. Initialize pdfMake modules
        // In pdfmake v0.3.x, named exports are: createPdf, virtualfs, fonts
        // The module does NOT use a `.default` export — import the whole module.
        const pdfMakeModule = await import("pdfmake/build/pdfmake");
        // Prefer the named createPdf; fall back to module root for CJS interop
        const pdfMake: any = pdfMakeModule;

        // 2. Fetch User Data
        const { data: langs } = await supabase.from("languages").select("*").eq("user_id", userId);
        const { data: words } = await supabase.from("words").select("*").eq("user_id", userId);
        const wordIds = (words ?? []).map((w: any) => w.id);

        const { data: meanings } = wordIds.length
            ? await supabase.from("meanings").select("*").in("word_id", wordIds)
            : { data: [] };

        const { data: examples } = wordIds.length
            ? await supabase.from("examples").select("*").in("word_id", wordIds)
            : { data: [] };

        const safeLangs = langs || [];
        const safeWords = words || [];
        const safeMeanings = meanings || [];
        const safeExamples = examples || [];

        // 3. Scan payload to determine which scripts (fonts) are actually required
        const requiredScripts = new Set<string>(["Default"]);

        safeWords.forEach((w: any) => {
            requiredScripts.add(getScriptFromText(w.word));
            const firstEx = safeExamples.find((e: any) => e.word_id === w.id);
            if (firstEx?.sentence) {
                requiredScripts.add(getScriptFromText(firstEx.sentence));
            }
        });

        // 4. Load only the necessary local fonts into the Virtual File System dictionary
        const customFonts = await fetchRequiredLocalFonts(requiredScripts as unknown as Set<any>);

        const vfs: Record<string, string> = {};
        for (const cf of customFonts) {
            const base64Str = await bufferToBase64(cf.buffer);
            vfs[cf.vfsName] = base64Str;
        }

        // 5. Structure data for renderer
        const renderData: RenderData = {
            userEmail,
            languages: safeLangs,
            words: safeWords,
            meanings: safeMeanings,
            examples: safeExamples
        };

        // 6. Generate Definition
        const docDefinition = generateDocumentDefinition(renderData, requiredScripts);

        // 7. Fire pure-vector PDF creation
        const targetPdfMake = pdfMake.default || pdfMake;

        // Use native methods available in v0.3.x for VFS integration
        if (typeof targetPdfMake.addVirtualFileSystem === 'function') {
            targetPdfMake.addVirtualFileSystem(vfs);
        } else {
            targetPdfMake.vfs = targetPdfMake.vfs ? { ...targetPdfMake.vfs, ...vfs } : vfs;
            targetPdfMake.virtualfs = targetPdfMake.vfs;
        }

        if (typeof targetPdfMake.addFonts === 'function') {
            targetPdfMake.addFonts(docDefinition.fonts);
        } else if (typeof targetPdfMake.setFonts === 'function') {
            targetPdfMake.setFonts(docDefinition.fonts);
        } else {
            targetPdfMake.fonts = { ...(targetPdfMake.fonts || {}), ...docDefinition.fonts };
        }

        console.log("INJECTED VFS KEYS:", Object.keys(vfs));
        console.log("GENERATION FONTS:", Object.keys(docDefinition.fonts || {}));

        if (typeof targetPdfMake.createPdf !== 'function') {
            throw new Error('pdfmake createPdf API not found. Check pdfmake version compatibility.');
        }

        const pdf = targetPdfMake.createPdf(docDefinition);

        // pdfmake v0.3.x getBlob() returns a Promise
        const blob = await pdf.getBlob();
        return blob as Blob;

    } catch (error) {
        throw new Error(error instanceof Error ? error.message : String(error));
    }
};
