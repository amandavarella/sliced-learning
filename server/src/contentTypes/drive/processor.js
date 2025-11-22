import axios from "axios";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { sanitizeHtml } from "../../utils/sanitize.js";

const WORDS_PER_MINUTE = 200;
const SEGMENT_MINUTES = 2;

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
 * Clean file name - remove extra text like "Shared", "Owner", etc.
 */
const cleanFileName = (fileName) => {
  if (!fileName) return "";
  
  // Remove common suffixes that Google Drive adds
  const cleaned = fileName
    .replace(/Shared$/i, '')
    .replace(/Owner.*$/i, '')
    .replace(/hidden.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Extract just the filename part (before any extra text)
  // Look for pattern: filename.extension
  const match = cleaned.match(/^([^\s]+\.\w{2,5})/);
  if (match) {
    return match[1];
  }
  
  return cleaned;
};

/**
 * Determine file type from file name
 */
const getFileType = (fileName) => {
  if (!fileName) return "unknown";
  
  // Clean the filename first
  const cleaned = cleanFileName(fileName);
  
  // Extract extension (handle cases like "m4aSh" -> "m4a")
  const parts = cleaned.split('.');
  if (parts.length < 2) return "unknown";
  
  let extension = parts.pop() || '';
  
  // Remove any trailing non-letter/number characters (e.g., "m4aSh" -> "m4a")
  // This handles case-insensitive matching
  extension = extension.replace(/[^a-zA-Z0-9].*$/i, '').toLowerCase();
  
  const audioExtensions = ['m4a', 'mp3', 'wav', 'ogg', 'aac', 'flac', 'wma'];
  const videoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'];
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
  const textExtensions = ['txt', 'md', 'json', 'xml', 'csv', 'log'];
  const documentExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
  
  if (audioExtensions.includes(extension)) return "audio";
  if (videoExtensions.includes(extension)) return "video";
  if (imageExtensions.includes(extension)) return "image";
  if (textExtensions.includes(extension)) return "text";
  if (documentExtensions.includes(extension)) return "document";
  
  return "unknown";
};

/**
 * Fetch file content from Google Drive
 * For public files, we can use the direct download link or view link
 */
const fetchFileContent = async (fileId, fileName = "") => {
  const fileType = getFileType(fileName);
  
  // For audio, video, and image files, we can't extract text content
  // Instead, provide a link to view/download the file
  if (fileType === "audio" || fileType === "video" || fileType === "image") {
    const viewUrl = `https://drive.google.com/file/d/${fileId}/view`;
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    
    return {
      content: `This is a ${fileType} file. [View in Google Drive](${viewUrl}) or [Download](${downloadUrl})`,
      type: "text",
      fileType,
      viewUrl,
      downloadUrl,
    };
  }
  
  // For text and document files, try to fetch content
  try {
    // Try direct download first
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    
    const response = await axios.get(downloadUrl, {
      responseType: "text",
      maxRedirects: 5,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      timeout: 30000,
    });

    // Check if we got actual content or an error page
    if (response.data && response.data.length > 100 && !response.data.includes('Google Drive - Virus scan warning')) {
      return {
        content: response.data,
        type: "text",
        fileType,
      };
    }
  } catch (error) {
    // Continue to try HTML view
  }
  
  // Try to get HTML view and extract content
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

    if (parsed && parsed.textContent && parsed.textContent.trim().length > 50) {
      return {
        content: parsed.textContent || "",
        type: "html",
        html: parsed.content,
        fileType,
      };
    }

    // Fallback: extract text from body
    const bodyText = dom.window.document.body?.textContent || "";
    if (bodyText.trim().length > 50) {
      return {
        content: bodyText,
        type: "text",
        fileType,
      };
    }
  } catch (fallbackError) {
    console.error("[driveService] Failed to fetch file content:", {
      fileId,
      fileName,
      error: fallbackError.message,
    });
  }
  
  // If all else fails, provide a link
  const viewUrl = `https://drive.google.com/file/d/${fileId}/view`;
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
  
  return {
    content: `Unable to extract text content from this file. [View in Google Drive](${viewUrl}) or [Download](${downloadUrl})`,
    type: "text",
    fileType,
    viewUrl,
    downloadUrl,
  };
};

/**
 * Check if a string looks like a valid Google Drive file ID
 * Valid IDs are typically 25-33 characters, alphanumeric with dashes/underscores
 * and don't contain obvious non-ID patterns
 */
const isValidFileId = (id, folderId) => {
  if (!id || typeof id !== 'string') {
    return false;
  }
  
  // Must be 25-33 characters (Google Drive file ID length)
  if (id.length < 25 || id.length > 33) {
    return false;
  }
  
  // Must be alphanumeric with dashes/underscores only
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return false;
  }
  
  // Filter out obvious non-file IDs
  const invalidPatterns = [
    /^ANONYMOUS_/i,
    /^Viewer/i,
    /^off$/i,
    /^on$/i,
    /^true$/i,
    /^false$/i,
    /^null$/i,
    /^undefined$/i,
  ];
  
  for (const pattern of invalidPatterns) {
    if (pattern.test(id)) {
      return false;
    }
  }
  
  // Must not be the folder ID
  if (id === folderId) {
    return false;
  }
  
  return true;
};

/**
 * List files in a Google Drive folder
 * For public folders, we scrape the folder page and extract file data
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
    const seenIds = new Set();
    
    // Google Drive stores file data in window['_DRIVE_ivd'] or similar
    // Look for the main data structure
    const driveDataPattern = /window\[['"]_DRIVE[^'"]*['"]\]\s*=\s*({[\s\S]*?});/;
    const driveDataMatch = html.match(driveDataPattern);
    
    if (driveDataMatch) {
      try {
        // Try to extract and parse the JSON
        let jsonStr = driveDataMatch[1];
        
        // The JSON might be incomplete, try to find the closing brace
        let braceCount = 0;
        let endIndex = 0;
        for (let i = 0; i < jsonStr.length; i++) {
          if (jsonStr[i] === '{') braceCount++;
          if (jsonStr[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
              endIndex = i + 1;
              break;
            }
          }
        }
        
        if (endIndex > 0) {
          jsonStr = jsonStr.substring(0, endIndex);
          const data = JSON.parse(jsonStr);
          
          // Recursively search for file entries
          // Files are typically in arrays with structure like: [fileId, ...otherData, fileName]
          const extractFiles = (obj, depth = 0) => {
            if (depth > 10) return; // Prevent infinite recursion
            
            if (Array.isArray(obj)) {
            // Check if first element looks like a file ID
            if (obj.length >= 2 && isValidFileId(obj[0], folderId)) {
              const fileId = obj[0];
              // File name is often in position 2 or 3, or in a nested structure
              let fileName = null;
              
              // Try different positions for file name
              for (let i = 1; i < Math.min(10, obj.length); i++) {
                if (typeof obj[i] === 'string' && obj[i].length > 0 && obj[i].length < 500) {
                  // Check if it looks like a file name (not a file ID, not a URL, has reasonable length)
                  if (!isValidFileId(obj[i], folderId) && 
                      !obj[i].match(/^https?:\/\//) &&
                      !obj[i].match(/^[0-9]+$/) && // Not just numbers
                      obj[i].includes('.')) { // File names usually have extensions
                    fileName = obj[i];
                    break;
                  }
                } else if (Array.isArray(obj[i]) && obj[i].length > 0) {
                  // Sometimes the name is in a nested array
                  for (const item of obj[i]) {
                    if (typeof item === 'string' && item.length > 0 && item.length < 500 && item.includes('.')) {
                      if (!isValidFileId(item, folderId) && !item.match(/^https?:\/\//)) {
                        fileName = item;
                        break;
                      }
                    }
                  }
                  if (fileName) break;
                }
              }
              
              if (fileId && !seenIds.has(fileId)) {
                seenIds.add(fileId);
                files.push({
                  id: fileId,
                  name: fileName || `File ${files.length + 1}`,
                });
              }
            }
              
              // Recursively check array elements
              obj.forEach(item => {
                if (typeof item === 'object' && item !== null) {
                  extractFiles(item, depth + 1);
                }
              });
            } else if (typeof obj === 'object' && obj !== null) {
              // Check object properties
              for (const [key, value] of Object.entries(obj)) {
                // Look for file-like structures
                if (key === 'id' && isValidFileId(value, folderId)) {
                  const fileId = value;
                  const fileName = obj.name || obj.title || obj.filename || null;
                  
                  if (fileId && !seenIds.has(fileId)) {
                    seenIds.add(fileId);
                    files.push({
                      id: fileId,
                      name: fileName || `File ${files.length + 1}`,
                    });
                  }
                } else if (typeof value === 'object' && value !== null) {
                  extractFiles(value, depth + 1);
                }
              }
            }
          };
          
          extractFiles(data);
        }
      } catch (parseError) {
        console.log("[driveService] Failed to parse embedded JSON:", parseError.message);
      }
    }
    
    // Alternative: Look for file links in the HTML
    // Google Drive file links have pattern: /drive/u/0/folders/FOLDER_ID or /file/d/FILE_ID
    const fileLinkPattern = /\/file\/d\/([a-zA-Z0-9_-]{25,33})/g;
    let linkMatch;
    while ((linkMatch = fileLinkPattern.exec(html)) !== null) {
      const fileId = linkMatch[1];
      if (isValidFileId(fileId, folderId) && !seenIds.has(fileId)) {
        seenIds.add(fileId);
        // Try to find the file name nearby in the HTML
        const contextStart = Math.max(0, linkMatch.index - 500);
        const contextEnd = Math.min(html.length, linkMatch.index + 500);
        const context = html.substring(contextStart, contextEnd);
        
        // Look for aria-label or title attributes near the link
        const nameMatch = context.match(/(?:aria-label|title)=["']([^"']{1,200})["']/i);
        const fileName = nameMatch ? nameMatch[1] : null;
        
        files.push({
          id: fileId,
          name: fileName || `File ${files.length + 1}`,
        });
      }
    }
    
    // Extract from data-id attributes in the DOM (primary method for Google Drive)
    const dom = new JSDOM(html, { url: folderUrl });
    const document = dom.window.document;
    
    // Look for elements with data-id attributes (Google Drive uses these for file IDs)
    const elementsWithDataId = document.querySelectorAll('[data-id]');
    elementsWithDataId.forEach((element) => {
      const fileId = element.getAttribute('data-id');
      if (isValidFileId(fileId, folderId) && !seenIds.has(fileId)) {
        // Try to extract file name from the element or nearby elements
        let fileName = null;
        
        // Check the element's text content
        const textContent = element.textContent?.trim() || '';
        if (textContent && textContent.length > 0 && textContent.length < 200) {
          // Check if it looks like a file name (has extension, not just numbers)
          if (textContent.includes('.') && !/^\d+$/.test(textContent)) {
            // Extract just the file name part (might have extra text like "Shared", "Owner", etc.)
            const nameMatch = textContent.match(/([^\s]+\.\w{2,5})/);
            if (nameMatch) {
              fileName = nameMatch[1];
            } else {
              // Take first reasonable chunk
              const parts = textContent.split(/\s+/);
              for (const part of parts) {
                if (part.includes('.') && part.length > 3 && part.length < 100) {
                  fileName = part;
                  break;
                }
              }
            }
          }
        }
        
        // If no name found, check parent or sibling elements
        if (!fileName) {
          const parent = element.parentElement;
          if (parent) {
            const parentText = parent.textContent?.trim() || '';
            const nameMatch = parentText.match(/([^\s]+\.\w{2,5})/);
            if (nameMatch) {
              fileName = nameMatch[1];
            }
          }
        }
        
        // If still no name, check for aria-label or title
        if (!fileName) {
          fileName = element.getAttribute('aria-label') || 
                    element.getAttribute('title') || 
                    null;
        }
        
        // Clean the file name to remove extra text
        if (fileName) {
          fileName = cleanFileName(fileName);
        }
        
        if (fileId && !seenIds.has(fileId)) {
          seenIds.add(fileId);
          files.push({
            id: fileId,
            name: fileName || `File ${files.length + 1}`,
          });
        }
      }
    });
    
    // Also look for links to files as fallback
    const fileLinks = document.querySelectorAll('a[href*="/file/d/"]');
    fileLinks.forEach((link) => {
      const href = link.getAttribute('href');
      const fileIdMatch = href.match(/\/file\/d\/([a-zA-Z0-9_-]{25,33})/);
      if (fileIdMatch) {
        const fileId = fileIdMatch[1];
        if (isValidFileId(fileId, folderId) && !seenIds.has(fileId)) {
          seenIds.add(fileId);
          const fileName = link.textContent?.trim() || 
                          link.getAttribute('aria-label') || 
                          link.getAttribute('title') ||
                          `File ${files.length + 1}`;
          
          files.push({
            id: fileId,
            name: fileName,
          });
        }
      }
    });

    // Remove duplicates (shouldn't be needed but just in case)
    const uniqueFiles = [];
    const finalSeenIds = new Set();
    
    for (const file of files) {
      if (isValidFileId(file.id, folderId) && !finalSeenIds.has(file.id)) {
        finalSeenIds.add(file.id);
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
 * Process file content into a single segment (one file = one segment)
 */
const processFileContent = (content, html, fileName) => {
  if (html) {
    const sanitizedHtml = sanitizeHtml(html);
    // Count words from the HTML content
    const tempDom = new JSDOM(`<body>${sanitizedHtml}</body>`);
    const textContent = tempDom.window.document.body.textContent || "";
    const wordCount = textContent.trim().split(/\s+/).filter(Boolean).length;
    
    return {
      html: sanitizedHtml,
      text: textContent,
      wordCount,
    };
  }

  // For text content, count words and return as single segment
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  return {
    text: content,
    wordCount,
    html: null,
  };
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

      const fileType = getFileType(file.name);
      const cleanedName = cleanFileName(file.name);
      
      console.log("[driveService] File type detection:", {
        originalName: file.name,
        cleanedName,
        detectedType: fileType,
      });
      
      // For audio, video, and image files, skip content fetching and create segment with links
      if (fileType === "audio" || fileType === "video" || fileType === "image") {
        const viewUrl = `https://drive.google.com/file/d/${file.id}/view`;
        const downloadUrl = `https://drive.google.com/uc?export=download&id=${file.id}`;
        
        segments.push({
          id: `segment-${index + 1}`,
          label: file.name || `File ${index + 1}`,
          wordCount: 0,
          estimatedMinutes: 0,
          text: `This is a ${fileType} file. [View in Google Drive](${viewUrl}) or [Download](${downloadUrl})`,
          html: null,
          fileId: file.id,
          fileName: file.name,
          fileType,
          viewUrl,
          downloadUrl,
        });
      } else {
        // For text/document files, try to fetch content
        try {
          const fileData = await fetchFileContent(file.id, file.name);
          const fileSegment = processFileContent(
            fileData.content,
            fileData.html,
            file.name,
          );

          // Each file becomes exactly one segment
          totalWords += fileSegment.wordCount;
          segments.push({
            id: `segment-${index + 1}`,
            label: file.name || `File ${index + 1}`,
            wordCount: fileSegment.wordCount,
            estimatedMinutes: Math.max(
              1,
              Math.round(fileSegment.wordCount / WORDS_PER_MINUTE),
            ),
            text: fileSegment.text,
            html: fileSegment.html,
            fileId: file.id,
            fileName: file.name,
            fileType,
          });
        } catch (fileError) {
          console.error("[driveService] Failed to process file:", {
            fileId: file.id,
            fileName: file.name,
            error: fileError.message,
          });
          // Add a placeholder segment for files that couldn't be processed
          const viewUrl = `https://drive.google.com/file/d/${file.id}/view`;
          const downloadUrl = `https://drive.google.com/uc?export=download&id=${file.id}`;
          segments.push({
            id: `segment-${index + 1}`,
            label: file.name || `File ${index + 1}`,
            wordCount: 0,
            estimatedMinutes: 0,
            text: `Unable to load content from file: ${file.name || file.id}. [View in Google Drive](${viewUrl}) or [Download](${downloadUrl})`,
            html: null,
            fileId: file.id,
            fileName: file.name,
            fileType,
            viewUrl,
            downloadUrl,
          });
        }
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

