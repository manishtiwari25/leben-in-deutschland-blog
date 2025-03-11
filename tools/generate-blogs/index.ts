import { promises as fs } from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as XLSX from 'xlsx';
import { Prüfstellen } from './types/prüfstellen';
import * as cheerio from 'cheerio';
import states from './states.json';

// Remove diacritics, quotes, unsafe symbols, replace spaces with hyphens, and limit length.
function sanitizeFilename(title: string): string {
    return title
        .normalize("NFD") // Normalize to remove diacritics
        .replace(/[\u0300-\u036f]/g, "") // Remove diacritical marks (but keep ä, ö, ü, ß)
        .replace(/["'„“”‘’`]/g, '') // Remove all types of quotes
        .replace(/&/g, 'and') // Replace ampersand with "and"
        .replace(/[?!.,:;(){}[\]<>|\\/]/g, "") // Remove unsafe symbols
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Ensure no double hyphens
        .toLowerCase()
        .slice(0, 100) // Limit filename length for safety
        .trim(); // Trim leading/trailing hyphens
}

function sanitizedescription(title: string): string {
    return title
        .normalize("NFD") // Normalize to remove diacritics
        .replace(/[\u0300-\u036f]/g, "") // Remove diacritical marks (but keep ä, ö, ü, ß)
        .replace(/["'„“”‘’`]/g, '') // Remove all types of quotes
        .replace(/&/g, 'and') // Replace ampersand with "and"
        .replace(/[?!.,:;(){}[\]<>|\\/]/g, "") // Remove unsafe symbols
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Ensure no double hyphens
        .toLowerCase()
        .trim(); // Trim leading/trailing hyphens
}

// Clean up tags and categories by replacing &, removing special characters, etc.
function cleanTagsAndCategories(value: string): string {
    return value
        .replace(/&/g, 'and') // Replace "&" with "and"
        .replace(/[!"'.,;:{}[\]<>|\\/]/g, '') // Remove special characters
        .replace(/\s+/g, ' ') // Normalize spaces
        .replace(/["'„“”‘’`]/g, '') // Remove all types of quotes
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .trim();
}

// Generates Markdown files using a Jekyll template.
const generateJekyllFiles = async (
    templatePath: string,
    outputDir: string,
    posts: {
        title: string;
        author: string;
        date: string;
        question: string;
        image: string | null;
        a: string;
        b: string;
        c: string;
        d: string;
        answer: string;
        description: string;
        fileName: string;
        explanation: string;
        categories: string;
        tags: string;
    }[]
) => {
    try {
        // Read the template file
        const templateContent = await fs.readFile(templatePath, 'utf-8');
        // Ensure output directory exists
        await fs.mkdir(outputDir, { recursive: true });
        // Loop through posts to create files
        for (const post of posts) {
            let processedContent = templateContent;
            // Replace placeholders in the template with actual post values.
            for (const key in post) {
                const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
                let value = post[key as keyof typeof post];
                // For the image key, if the value is falsy, "null", or not valid, use an empty string.
                if (key === 'image') {
                    if (!value || value === "null") {
                        value = "";
                    }
                }
                processedContent = processedContent.replace(regex, value as string);
            }
            // Create filename using date and sanitized fileName.
            const fileName = `${post.date}-${post.fileName.replace(/\s+/g, '-').toLowerCase()}.md`;
            const filePath = path.join(outputDir, fileName);
            await fs.writeFile(filePath, processedContent, 'utf-8');
            console.log(`✅ File created: ${filePath}`);
        }
    } catch (error) {
        console.error('❌ Error:', error);
    }
};

// Fetch JSON data from a given URL.
async function fetchJsonData(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve(jsonData);
                } catch (error) {
                    reject(new Error('Failed to parse JSON data.'));
                }
            });
        }).on('error', (err) => {
            reject(new Error('Failed to fetch data: ' + err.message));
        });
    });
}

const url = 'https://raw.githubusercontent.com/leben-in-deutschland/leben-in-deutschland-app/main/src/scrap/data/question.json';

const generatePosts = async () => {
    const jsonData = await fetchJsonData(url)
    const posts_en = [];
    const posts_de = [];
    // Read config to keep track of processed posts
    const configFile = await fs.readFile('config.json', 'utf-8');
    const config = JSON.parse(configFile);
    for (const key in jsonData) {
        const post = jsonData[key];
        if (config[post.id]) {
            continue;
        }
        // Use current date if not already processed.
        config[post.id] = new Date().toISOString().split('T')[0];
        // For image: if post.image equals "-" or is empty/"null", then use null.
        const image = (post.image === "-" || !post.image || post.image === "null") ? "" : `![Image](${post.image})`;
        // Generate German version
        posts_de.push({
            fileName: sanitizeFilename(post.question),
            title: sanitizeFilename(post.question),
            author: 'leben-in-deutschland',
            date: config[post.id],
            question: post.question,
            image: image,
            a: post.a,
            b: post.b,
            c: post.c,
            d: post.d,
            answer: post.solution,
            description: sanitizedescription(post.question),
            explanation: post.context,
            categories: cleanTagsAndCategories(post.category),
            tags: cleanTagsAndCategories(post.category),
        });
        // Generate English version (assuming a translation exists under "en")
        const enData = post.translation["en"];
        posts_en.push({
            fileName: sanitizeFilename(post.question),
            title: sanitizeFilename(enData.question),
            author: 'leben-in-deutschland',
            date: config[post.id],
            question: enData.question,
            image: image,
            description: sanitizedescription(enData.question),
            a: enData.a,
            b: enData.b,
            c: enData.c,
            d: enData.d,
            answer: post.solution,
            explanation: enData.context,
            categories: cleanTagsAndCategories(post.category),
            tags: cleanTagsAndCategories(post.category),
        });
    }
    // Generate Markdown files for both languages.
    await generateJekyllFiles('jekyll_template.txt', "../../_posts/de", posts_de);
    await generateJekyllFiles('jekyll_template.txt', "../../_posts/en", posts_en);
    // Update the config file
    await fs.writeFile('config.json', JSON.stringify(config, null, 2), 'utf-8');
};

const BASE_URL_BAMF = "https://www.bamf.de"
async function scrapPrüfstellenForState(stateCode: string): Promise<Prüfstellen[]> {
    let allPrüfstellen = [];
    const page = `${BASE_URL_BAMF}/SharedDocs/Anlagen/DE/Integration/Einbuergerung/Pruefstellen-${stateCode.toUpperCase()}.xlsx`;
    const $ = await cheerio.fromURL(page);
    let links = [];
    $('ul>li>a.c-link.c-link--download.c-link--desc.c-link--orient').each((_, element) => {
        const href = $(element).attr('href');
        const url = `${BASE_URL_BAMF}${href}`;
        links.push(url);
    });

    for (let i = 0; i < links.length; i++) {
        const resp = await fetch(links[i]);
        if (!resp.ok) {
            console.log(`Error fetching ${links[i]}`);
            continue;
        }
        const blob = await resp.blob();
        const text = await blob.arrayBuffer();
        const workbook = XLSX.read(text, { type: "binary" });

        for (let sheet in workbook.Sheets) {
            let worksheet = workbook.Sheets[sheet];
            let rows = XLSX.utils.sheet_to_json(worksheet, { raw: true, header: 1, blankrows: false, skipHidden: true, defval: "" });
            for (let i = 1; i < rows.length; i++) {
                const prüfstelle = {
                    regierungsbezirk: !rows[i][0] ? (rows[i][0] + " ") : "" + rows[i][1],
                    plz: rows[i][2],
                    ort: rows[i][3],
                    einrichtung: rows[i][4],
                    straße: rows[i][5],
                    telefon: rows[i][6],
                    email: rows[i][7],
                };
                allPrüfstellen.push(prüfstelle);
            }
        }
    }
    return allPrüfstellen;
}

const scrapPrüfstellen = async (): Promise<{
    stateCode: string,
    stateName: string,
    eng: string,
    capital: string,
    data: Prüfstellen[]
}[]> => {
    try {
        let allPrüfstellen = [];
        for (let i = 0; i < states.length; i++) {
            const data = (await scrapPrüfstellenForState(states[i].code))
                .filter((x) => (!x.regierungsbezirk.startsWith("Stand")))
                .filter((x) => x.einrichtung !== "");

            data.shift();

            allPrüfstellen.push({
                "stateCode": states[i].code,
                "stateName": states[i].name,
                "eng": states[i].eng,
                "capital": states[i].capital,
                "data": data
            });
        }
        return allPrüfstellen;
    } catch (error) {
        console.error('Error scraping data:', error);
    }
    return [];
}
function uniqByReduce<T>(array: T[]): T[] {
    return array.reduce((acc: T[], cur: T) => {
        if (!acc.includes(cur)) {
            acc.push(cur);
        }
        return acc;
    }, [])
}
async function generatePrüfstellenPosts() {
    const prüfstellen = await scrapPrüfstellen();
    const date = "2025-03-10";
    for (const state of prüfstellen) {
        const templateContent = await fs.readFile("jekyll_pruefstellen.txt", 'utf-8');
        // Ensure output directory exists
        await fs.mkdir("../../_posts/prüfstellen", { recursive: true });

        const tableRows = state.data.map(prüfstelle =>
            `|${prüfstelle.regierungsbezirk}|${prüfstelle.plz}|${prüfstelle.ort}|${prüfstelle.einrichtung}|${prüfstelle.straße}|${prüfstelle.telefon}|${prüfstelle.email}|`
        ).join('\n');

        const tagEinrichtungData = state.data.filter(x => x.einrichtung).map(prüfstelle => cleanTagsAndCategories("prüfstellen-in-" + prüfstelle.einrichtung)).join(' ');
        const tagOrtData = uniqByReduce(state.data.filter(x => x.ort).map(prüfstelle => cleanTagsAndCategories("prüfstellen-in-" + prüfstelle.ort))).join(' ');
        const tagplzData = uniqByReduce(state.data.filter(x => x.plz).map(prüfstelle => "prüfstellen-in-" + prüfstelle.plz)).join(' ');

        const sanitizeFileName = sanitizeFilename(state.stateName);

        let processedContent = templateContent.replace('{{ tableRows }}', tableRows);
        processedContent = processedContent.replace('{{ title }}', sanitizeFileName);
        processedContent = processedContent.replace('{{ lastUpdate }}', new Date().toISOString().split('T')[0]);
        processedContent = processedContent.replace('{{ date }}', date);
        processedContent = processedContent.replace('{{ categories }}', `${state.stateCode} ${state.stateName}`);
        processedContent = processedContent.replace('{{ tags }}', `${state.stateCode} ${state.stateName} ${tagEinrichtungData} ${tagOrtData} ${tagplzData}
            `);
        processedContent = processedContent.replace('{{ heroImage }}', `https://www.lebenindeutschland.org/states/coat-of-arms/${state.stateName}.svg`);

        const fileName = `${date}-prüfstellen-in-${sanitizeFileName}.md`;
        const filePath = path.join("../../_posts/prüfstellen", fileName);
        await fs.writeFile(filePath, processedContent, 'utf-8');
        console.log(`✅ File created: ${filePath}`);
    }
};

const scrapAllSources = async () => {
    await generatePosts();
    await generatePrüfstellenPosts();
};

scrapAllSources().then(() => {
    console.log('Scraping completed successfully');
    process.exit(0);
}).catch((err) => {
    console.error('Error scraping data:', err);
    process.exit(1);
});