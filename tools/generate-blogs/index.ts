import { promises as fs } from 'fs';
import * as path from 'path';
import * as https from 'https';

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

fetchJsonData(url).then(async (jsonData) => {
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
    process.exit(0);
}).catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
});
