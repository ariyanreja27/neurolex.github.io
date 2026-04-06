import { FONTS_REGISTRY, getScriptFromText } from "./pdfTypographyConfig";
import { isRTLSentence } from "./directionHandler";

export interface PdfWord {
    id: string;
    word: string;
    type?: string;
}

export interface PdfMeaning {
    word_id: string;
    meaning: string;
}

export interface PdfExample {
    word_id: string;
    sentence: string;
    sentence_meaning?: string;
}

export interface PdfLanguage {
    id: string;
    name: string;
}

export interface RenderData {
    userEmail: string;
    languages: PdfLanguage[];
    words: PdfWord[];
    meanings: PdfMeaning[];
    examples: PdfExample[];
}

/**
 * Maps the collected user data arrays (languages, words, meanings, examples)
 * into a structured pdfMake Document Definition object for final rendering.
 * Selectively applies correct fonts and RTL orientation per cell.
 * 
 * @function generateDocumentDefinition
 * @param {RenderData} data - The aggregated payload of all words and user context.
 * @param {Set<string>} loadedScripts - Safely tracking which fonts successfully buffered.
 * @returns {Object} The complete pdfMake Document Definition layout.
 */
export const generateDocumentDefinition = (data: RenderData, loadedScripts: Set<string>) => {
    // Reconstruct valid font map from what was actually loaded
    const fontMapping: any = {};
    loadedScripts.forEach((script) => {
        const f = FONTS_REGISTRY[script as keyof typeof FONTS_REGISTRY];
        if (f) {
            fontMapping[f.fontName] = {
                normal: f.vfsName,
                bold: f.vfsName,
                italics: f.vfsName,
                bolditalics: f.vfsName
            };
        }
    });

    const pad = (n: number) => n.toString().padStart(2, '0');
    const d = new Date();
    const formattedDate = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}  ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

    const content: any[] = [];
    content.push({ text: "NeuroLex Vault", style: "header" });
    content.push({ text: `Exported: ${formattedDate}   |   User: ${data.userEmail}`, style: "subheader" });
    content.push({ canvas: [{ type: "line", x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1 }] });
    content.push({ text: "", margin: [0, 0, 0, 20] }); // Spacer

    if (data.languages.length === 0) {
        content.push({ text: "No languages found.", style: "body" });
        return { content, defaultStyle: { font: "Merriweather", fontSize: 10 } };
    }

    data.languages.forEach((lang, langIndex) => {
        const langWords = data.words.filter(w => String((w as any).language_id) === String(lang.id));
        if (langWords.length === 0) return;

        if (langIndex > 0) {
            content.push({ text: "", pageBreak: "before" });
        }

        content.push({ text: `${lang.name || "Unknown"} Repository`, style: "sectionHeader" });

        const tableBody: any[][] = [
            [
                { text: "#", style: "tableHeader" },
                { text: "Word", style: "tableHeader" },
                { text: "Type", style: "tableHeader" },
                { text: "Meanings", style: "tableHeader" },
                { text: "Sentence", style: "tableHeader" },
                { text: "Translation", style: "tableHeader" }
            ]
        ];

        langWords.forEach((w, idx) => {
            const wMeanings = data.meanings.filter(m => m.word_id === w.id).map(m => m.meaning).join(", ");
            const firstEx = data.examples.find(e => e.word_id === w.id);

            const typeMap: Record<string, string> = {
                "noun": "noun.",
                "pronoun": "pron.",
                "adjective": "adj.",
                "verb": "verb.",
                "adverb": "adv.",
                "preposition": "prep.",
                "conjunction": "conj.",
                "interjection": "interj.",
                "determiner": "det."
            };
            const wType = (w.type && typeMap[w.type.toLowerCase()]) || w.type || "-";

            const wordScript = getScriptFromText(w.word);
            const sentenceScript = getScriptFromText(firstEx?.sentence || "");

            // Enforce Merriweather for English core columns. 
            // Fallback dynamically mapped scripts for multilingal columns.
            const wordFont = fontMapping[FONTS_REGISTRY[wordScript]?.fontName] ? FONTS_REGISTRY[wordScript].fontName : "Merriweather";
            const sentenceFont = fontMapping[FONTS_REGISTRY[sentenceScript]?.fontName] ? FONTS_REGISTRY[sentenceScript].fontName : "Merriweather";

            const rowColor = idx % 2 === 0 ? "#f5f5f5" : "#ffffff";

            tableBody.push([
                { text: String(idx + 1), fillColor: rowColor, alignment: "center", color: "#888888", margin: [0, 5, 0, 5] },

                // Dynamic Word (Any Language, Any Script)
                {
                    text: w.word || "-",
                    fillColor: rowColor,
                    font: wordFont,
                    direction: isRTLSentence(w.word) ? 'rtl' : 'ltr',
                    bold: true,
                    fontSize: 12,
                    color: "#000000",
                    margin: [0, 5, 0, 5]
                },

                // Fixed Type (Always English)
                { text: wType, fillColor: rowColor, font: "Merriweather", alignment: "center", color: "#666666", margin: [0, 5, 0, 5] },

                // Fixed Meanings (Always English)
                { text: wMeanings || "-", fillColor: rowColor, font: "Merriweather", color: "#222222", margin: [0, 5, 0, 5] },

                // Dynamic Sentence (Any Language, Any Script)
                {
                    text: firstEx?.sentence || "-",
                    fillColor: rowColor,
                    font: sentenceFont,
                    direction: isRTLSentence(firstEx?.sentence) ? 'rtl' : 'ltr',
                    italics: true,
                    color: "#444444",
                    margin: [0, 5, 0, 5]
                },

                // Fixed Translation (Always English)
                { text: firstEx?.sentence_meaning || "-", fillColor: rowColor, font: "Merriweather", color: "#777777", margin: [0, 5, 0, 5] }
            ]);
        });

        content.push({
            table: {
                headerRows: 1,
                widths: ["5%", "20%", "10%", "20%", "25%", "20%"],
                body: tableBody
            },
            layout: {
                hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 0 : 0.5,
                vLineWidth: () => 0,
                hLineColor: () => "#e0e0e0",
                paddingLeft: () => 6,
                paddingRight: () => 6,
                paddingTop: () => 6,
                paddingBottom: () => 6
            }
        });
    });

    return {
        content: content,
        defaultStyle: {
            font: "Merriweather",
            fontSize: 10
        },
        styles: {
            header: { fontSize: 24, bold: true, margin: [0, 0, 0, 8] },
            subheader: { fontSize: 10, color: "#666666", margin: [0, 0, 0, 12] },
            sectionHeader: { fontSize: 16, bold: true, margin: [0, 20, 0, 12] },
            tableHeader: { bold: true, fontSize: 10, color: "#ffffff", fillColor: "#000000", alignment: "center", margin: [0, 5, 0, 5] }
        },
        pageMargins: [40, 40, 40, 40] as any,
        // Register the dynamic map natively into the document Definition
        fonts: fontMapping
    };
};
