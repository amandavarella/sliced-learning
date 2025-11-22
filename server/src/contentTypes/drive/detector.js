/**
 * Detects if a URL is a Google Drive folder
 */
export const detectDrive = (url) => {
  try {
    // Match Google Drive folder URLs
    // Examples:
    // https://drive.google.com/drive/folders/FOLDER_ID
    // https://drive.google.com/drive/u/0/folders/FOLDER_ID
    return /drive\.google\.com\/drive.*\/folders\//i.test(url);
  } catch (error) {
    return false;
  }
};

