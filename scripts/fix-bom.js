"use strict";
// Compiled version of https://github.com/parasoft/parasoft-findings-vsts/blob/master/scripts/fix-bom.ts
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const process = require("process");
// Read JSON file
function readJSONFile(filePath) {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContent);
}
// Get file paths from command-line arguments
const sbomFilePath = process.argv[2];
const licenseMappingFilePath = process.argv[3];
const injectionMappingFilePath = process.argv[4];
// Load the SBOM and license mapping JSON files
const sbom = readJSONFile(sbomFilePath);
const licenseMapping = readJSONFile(licenseMappingFilePath);
const injectionMapping = readJSONFile(injectionMappingFilePath);
// Function to update licenses in SBOM based on the license mapping
function update(sbom, licenseMap, injectionMap) {
    sbom.components.forEach(component => {
        var _a, _b, _c, _d, _e, _f;
        if (!component.licenses || !((_b = (_a = component.licenses[0]) === null || _a === void 0 ? void 0 : _a.license) === null || _b === void 0 ? void 0 : _b.id) || !((_d = (_c = component.licenses[0]) === null || _c === void 0 ? void 0 : _c.license) === null || _d === void 0 ? void 0 : _d.url)) {
            // console.debug("\"Licenses\" for component " + component.purl + " is incomplete. Trying to update it based on: " + licenseMappingFilePath);
            const mapping = licenseMap.find(m => m.purl === component.purl);
            if (mapping) {
                component.licenses = mapping.licenses;
                // TODO: make sure both 'id' and 'url' are present in the license object
                // console.debug("\"Licenses\" for component " + component.purl + " is updated.");
            }
            else {
                console.log(`Missing "Licenses" information for component ${component.purl}`);
            }
        }
        if (!component.externalReferences) {
            console.log(`"externalReferences" for component ${component.purl} is missing.`);
            component.externalReferences = [];
        }
        const licenseRef = component.externalReferences.find(ref => ref.type === 'license');
        if (!licenseRef && ((_f = (_e = component.licenses[0]) === null || _e === void 0 ? void 0 : _e.license) === null || _f === void 0 ? void 0 : _f.url)) {
            component.externalReferences.push({ type: 'license', url: component.licenses[0].license.url });
            // console.debug("\"license\" in \"externalReferences\" for component " + component.purl + " is updated.");
        }
        const otherRef = component.externalReferences.find(ref => ref.type === 'other');
        if (!otherRef) {
            const mapping = injectionMap.find(m => m.purl === component.purl);
            if (mapping) {
                const other = mapping.externalReferences.find(ref => ref.type === 'other');
                if (other) {
                    component.externalReferences.push({ type: 'other', url: other.url });
                    // console.debug("\"other\" in \"externalReferences\" for component " + component.purl + " is updated.");
                    return;
                }
            }
            console.log(`Missing "other" information in "externalReferences" for component ${component.purl}`);
        }
    });
    return sbom;
}
// Update the SBOM licenses
const updatedSbom = update(sbom, licenseMapping, injectionMapping);
// Save the updated SBOM back to the original file
fs.writeFileSync(sbomFilePath, JSON.stringify(updatedSbom, null, 2), 'utf8');
console.log('SBOM licenses updated based on license-mapping.json and injection-mapping.json.');
//# sourceMappingURL=fix-bom.js.map