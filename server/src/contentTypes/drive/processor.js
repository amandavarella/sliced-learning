import axios from "axios";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { chunkByWordGoal, chunkHtmlContent } from "../../utils/segmentation.js";
import { sanitizeHtml } from "../../utils/sanitize.js";

const WORDS_PER_MINUTE = 200;
const SEGMENT_MINUTES = 2;
const MAX_WORDS_PER_SEGMENT = WORDS_PER_MINUTE * SEGMENT_MINUTES;

/**
 * Extract folder ID from Google Drive URL
 * Supports various Google Drive URL formats
 */
const extractFolderId = (url) => {
  try {
    const urlObj = new URL(url);
    
    // Match: /drive/folders/FOLDER_ID or /drive/u/0/folders/FOLDER_ID
    const match = urlObj.pathname.match(/\/drive\/.*?\/folders\/([^/?]+)/);
    if (match) {
      return match[1];
    }
    
    // Also check query params for id
    if (urlObj.searchParams.has("id")) {
      return urlObj.searchParams.get("id");
    }
    
    return null;
  } catch (error) {
    console.error("[driveService] Failed to parse URL:", {
      url,
      error: error.message,
    });
    return null;
  }
};

/**
 * Fetch file content from Google Drive
 * For public files, we can use the direct download link
 */
const fetchFileContent = async (fileId, fileName = "") => {
  try {
    // Try to get file content using direct download link
    // For public files, we can use: https://drive.google.com/uc?export=download&id=FILE_ID
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    
    // First, try to get the file metadata to determine type
    const response = await axios.get(downloadUrl, {
      responseType: "text",
      maxRedirects: 5,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      timeout: 30000,
    });

    return {
      content: response.data,
      type: "text",
    };
  } catch (error) {
    // If direct download fails, try to get HTML view and extract content
    try {
      const viewUrl = `https://drive.google.com/file/d/${fileId}/view`;
      const htmlResponse = await axios.get(viewUrl, {
        responseType: "text",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        },
        timeout: 30000,
      });

      const dom = new JSDOM(htmlResponse.data, { url: viewUrl });
      const reader = new Readability(dom.window.document);
      const parsed = reader.parse();

      if (parsed) {
        return {
          content: parsed.textContent || parsed.content || "",
          type: "html",
          html: parsed.content,
        };
      }

      // Fallback: extract text from body
      const bodyText = dom.window.document.body?.textContent || "";
      return {
        content: bodyText,
        type: "text",
      };
    } catch (fallbackError) {
      console.error("[driveService] Failed to fetch file content:", {
        fileId,
        fileName,
        error: fallbackError.message,
      });
      return {
        content: `Unable to load content from file: ${fileName || fileId}`,
        type: "text",
      };
    }
  }
};

/**
 * List files in a Google Drive folder
 * For public folders, we can scrape the folder page
 * Google Drive embeds file data in window['_DRIVE_ivd'] or similar JSON structures
 */
const listFolderFiles = async (folderId) => {
  try {
    const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
    
    const response = await axios.get(folderUrl, {
      responseType: "text",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      timeout: 30000,
    });

    const html = response.data;
    const files = [];
    
    // Google Drive embeds file data in script tags
    // Look for JSON data structures that contain file information
    const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    
    if (scriptMatches) {
      for (const scriptTag of scriptMatches) {
        const scriptContent = scriptTag.replace(/<\/?script[^>]*>/gi, '');
        
        // Try to find window['_DRIVE_ivd'] or similar structures
        // Look for patterns like: window['_DRIVE_ivd'] = {...}
        const driveDataMatches = scriptContent.match(/window\[['"]_DRIVE[^'"]*['"]\]\s*=\s*({[\s\S]*?});/);
        
        if (driveDataMatches) {
          try {
            const jsonStr = driveDataMatches[1];
            const data = JSON.parse(jsonStr);
            
            // Navigate through the data structure to find files
            // The structure varies, so we'll try multiple paths
            const findFilesInObject = (obj, path = []) => {
              if (typeof obj !== 'object' || obj === null) {
                return;
              }
              
              // Look for arrays that might contain file data
              if (Array.isArray(obj)) {
                obj.forEach((item, index) => {
                  if (typeof item === 'object' && item !== null) {
                    // Check if this looks like a file object
                    if (item[0] && typeof item[0] === 'string' && item[0].length >= 25) {
                      // This might be a file ID
                      const fileId = item[0];
                      const fileName = item[2] || item[1] || `File ${files.length + 1}`;
                      
                      if (fileId !== folderId && !files.find(f => f.id === fileId)) {
                        files.push({
                          id: fileId,
                          name: String(fileName),
                        });
                      }
                    }
                    findFilesInObject(item, [...path, index]);
                  }
                });
              } else {
                // Check object keys for file-like structures
                for (const [key, value] of Object.entries(obj)) {
                  if (key === 'id' && typeof value === 'string' && value.length >= 25 && value !== folderId) {
                    const fileName = obj.name || obj.title || `File ${files.length + 1}`;
                    if (!files.find(f => f.id === value)) {
                      files.push({
                        id: value,
                        name: String(fileName),
                      });
                    }
                  }
                  findFilesInObject(value, [...path, key]);
                }
              }
            };
            
            findFilesInObject(data);
          } catch (parseError) {
            // If JSON parsing fails, continue with other methods
            console.log("[driveService] Failed to parse embedded JSON:", parseError.message);
          }
        }
        
        // Also look for direct file ID patterns in script content
        // Google Drive file IDs are typically 25-33 characters
        const fileIdPattern = /["']([a-zA-Z0-9_-]{25,33})["']/g;
        let match;
        while ((match = fileIdPattern.exec(scriptContent)) !== null) {
          const potentialId = match[1];
          if (potentialId !== folderId && !files.find(f => f.id === potentialId)) {
            files.push({
              id: potentialId,
              name: `File ${files.length + 1}`,
            });
          }
        }
      }
    }
    
    // Fallback: Try DOM parsing
    if (files.length === 0) {
      const dom = new JSDOM(html, { url: folderUrl });
      const document = dom.window.document;
      
      // Look for elements with data-id attributes
      const elementsWithId = document.querySelectorAll('[data-id]');
      elementsWithId.forEach((element) => {
        const fileId = element.getAttribute('data-id');
        if (fileId && fileId.length >= 25 && fileId !== folderId) {
          const fileName = element.textContent?.trim() || 
                          element.getAttribute('aria-label') || 
                          element.getAttribute('title') ||
                          `File ${files.length + 1}`;
          
          if (!files.find(f => f.id === fileId)) {
            files.push({
              id: fileId,
              name: fileName,
            });
          }
        }
      });
    }

    // Remove duplicates and filter out the folder itself
    const uniqueFiles = [];
    const seenIds = new Set();
    
    for (const file of files) {
      if (file.id !== folderId && !seenIds.has(file.id)) {
        seenIds.add(file.id);
        uniqueFiles.push(file);
      }
    }

    return uniqueFiles;
  } catch (error) {
    console.error("[driveService] Failed to list folder files:", {
      folderId,
      error: error.message,
    });
    throw new Error(`Unable to access Google Drive folder: ${error.message}`);
  }
};

/**
 * Process file content into segments
 */
const processFileContent = (content, html, fileName) => {
  if (html) {
    const sanitizedHtml = sanitizeHtml(html);
    const htmlSegments = chunkHtmlContent(sanitizedHtml, MAX_WORDS_PER_SEGMENT);
    
    if (htmlSegments.length > 0) {
      return htmlSegments.map((segment) => ({
        html: segment.html,
        text: segment.text,
        wordCount: segment.wordCount,
      }));
    }
  }

  // Fallback to text-based chunking
  const textSegments = chunkByWordGoal(content, MAX_WORDS_PER_SEGMENT);
  return textSegments.map((segment) => ({
    text: segment.text,
    wordCount: segment.wordCount,
    html: null,
  }));
};

export const processDrive = async (url) => {
  console.log("[driveService] Starting Google Drive folder processing:", { url });

  const folderId = extractFolderId(url);

  if (!folderId) {
    console.error("[driveService] Failed to extract folder ID:", { url });
    throw new Error("Invalid Google Drive folder URL format");
  }

  console.log("[driveService] Extracted folder ID:", { folderId });

  try {
    // List files in the folder
    const files = await listFolderFiles(folderId);

    if (files.length === 0) {
      throw new Error("No files found in the Google Drive folder");
    }

    console.log("[driveService] Found files:", {
      folderId,
      fileCount: files.length,
    });

    // Process each file as a segment
    const segments = [];
    let totalWords = 0;

    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      console.log("[driveService] Processing file:", {
        index: index + 1,
        total: files.length,
        fileId: file.id,
        fileName: file.name,
      });

      try {
        const fileData = await fetchFileContent(file.id, file.name);
        const fileSegments = processFileContent(
          fileData.content,
          fileData.html,
          file.name,
        );

        // If file has multiple segments, create sub-segments
        // Otherwise, create a single segment per file
        if (fileSegments.length === 1) {
          const segment = fileSegments[0];
          totalWords += segment.wordCount;
          segments.push({
            id: `segment-${index + 1}`,
            label: file.name || `File ${index + 1}`,
            wordCount: segment.wordCount,
            estimatedMinutes: Math.max(
              1,
              Math.round(segment.wordCount / WORDS_PER_MINUTE),
            ),
            text: segment.text,
            html: segment.html,
            fileId: file.id,
            fileName: file.name,
          });
        } else {
          // Multiple segments from one file
          fileSegments.forEach((fileSegment, segIndex) => {
            totalWords += fileSegment.wordCount;
            segments.push({
              id: `segment-${index + 1}-${segIndex + 1}`,
              label:
                fileSegments.length > 1
                  ? `${file.name} - Part ${segIndex + 1}`
                  : file.name,
              wordCount: fileSegment.wordCount,
              estimatedMinutes: Math.max(
                1,
                Math.round(fileSegment.wordCount / WORDS_PER_MINUTE),
              ),
              text: fileSegment.text,
              html: fileSegment.html,
              fileId: file.id,
              fileName: file.name,
            });
          });
        }
      } catch (fileError) {
        console.error("[driveService] Failed to process file:", {
          fileId: file.id,
          fileName: file.name,
          error: fileError.message,
        });
        // Add a placeholder segment for files that couldn't be processed
        segments.push({
          id: `segment-${index + 1}`,
          label: file.name || `File ${index + 1}`,
          wordCount: 0,
          estimatedMinutes: 0,
          text: `Unable to load content from file: ${file.name || file.id}`,
          html: null,
          fileId: file.id,
          fileName: file.name,
        });
      }
    }

    if (segments.length === 0) {
      throw new Error("No content could be extracted from the folder files");
    }

    // Get folder name from URL or use default
    const folderName = `Google Drive Folder (${files.length} files)`;

    return {
      type: "drive",
      title: folderName,
      folderId,
      sourceUrl: url,
      segmentMinutes: SEGMENT_MINUTES,
      totalSegments: segments.length,
      totalWords,
      segments,
    };
  } catch (error) {
    console.error("[driveService] Google Drive folder processing failed:", {
      url,
      folderId,
      errorMessage: error.message,
      errorName: error.name,
    });
    throw error;
  }
};

