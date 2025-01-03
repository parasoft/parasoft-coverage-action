import * as core from "@actions/core";
import * as types from './types';
import * as cp from 'child_process';
import * as os from 'os';
import * as fs from 'fs';
import * as sax from 'sax';
import * as lodash from 'lodash';
import * as pt from 'path';
import * as glob from 'glob';
import {messages, messagesFormatter} from './messages';

export interface RunOptions {
    /* Specify a path to folder or a file for the Parasoft coverage report */
    report: string;

    /* Specify a path to Parasoft tools installation folder or Java installation folder */
    parasoftToolOrJavaRootPath: string;
}

export interface RunDetails {
    exitCode: number;
    convertedCoberturaReportPaths?: string[];
}

export class CoverageParserRunner {
    private readonly WORKING_DIRECTORY = process.env.GITHUB_WORKSPACE || process.cwd();
    private readonly MERGED_COBERTURA_REPORT_PATH: string = pt.join(this.WORKING_DIRECTORY, 'parasoft-merged-cobertura.xml');

    async run(runOptions: RunOptions) : Promise<RunDetails> {
        const parasoftReportPaths = this.findParasoftCoverageReports(runOptions.report);
        if (!parasoftReportPaths || parasoftReportPaths.length == 0) {
            return Promise.reject(messagesFormatter.format(messages.coverage_report_not_found, runOptions.report));
        }

        const javaFilePath = this.getJavaFilePath(runOptions.parasoftToolOrJavaRootPath);
        if (!javaFilePath) {
            return { exitCode: -1 }
        }

        const outcome = await this.convertReportsWithJava(javaFilePath, parasoftReportPaths);
        if (outcome.exitCode == 0 && outcome.convertedCoberturaReportPaths?.length) {
            const mergedCoberturaCoverage = this.mergeCoberturaReports(outcome.convertedCoberturaReportPaths);
            if (!mergedCoberturaCoverage) { // Should never happen
                return { exitCode: -1 }
            }

            await this.generateCoverageSummary(mergedCoberturaCoverage);
        }

        return { exitCode: outcome.exitCode };
    }

    private findParasoftCoverageReports(reportPath: string) : string[] | undefined {
        let reportPaths: string[] = [];
        if (pt.isAbsolute(reportPath)) {
            // with absolute path
            core.info(messages.finding_coverage_report);
            // Handle for path like '/coverage.xml' in Windows
            reportPath = pt.resolve(reportPath);
        } else {
            // with relative path
            core.info(messagesFormatter.format(messages.finding_coverage_report_in_working_directory , this.WORKING_DIRECTORY));
            reportPath = pt.join(this.WORKING_DIRECTORY, reportPath);
        }

        // When report path is a directory
        if (pt.extname(reportPath) == '') {
            reportPath = pt.join(reportPath, "coverage.xml");
        }

        reportPath = reportPath.replace(/\\/g, "/");

        try {
            // Use glob to find the matching report paths
            reportPaths = glob.sync(reportPath);
        } catch (error) {
            return undefined;
        }

        if (!reportPaths) {
            return undefined;
        }

        if (reportPaths.length == 1) {
            core.info(messagesFormatter.format(messages.found_coverage_report, reportPaths[0]));
        } else if (reportPaths.length > 1) {
            core.info(messagesFormatter.format(messages.found_multiple_coverage_report, reportPaths.length));
        }

        return reportPaths;
    }

    private getJavaFilePath(parasoftToolOrJavaRootPath: string | undefined): string | undefined {
        let installDir = parasoftToolOrJavaRootPath || process.env.JAVA_HOME;

        if (!installDir || !fs.existsSync(installDir)) {
            core.warning(messages.java_or_parasoft_tool_install_dir_not_found);
            return undefined;
        }

        const javaFilePath = this.doGetJavaFilePath(installDir);
        if (!javaFilePath) {
            core.warning(messagesFormatter.format(messages.java_not_found_in_java_or_parasoft_tool_install_dir));
        } else {
            core.debug(messagesFormatter.format(messages.found_java_at, javaFilePath));
        }

        return javaFilePath;
    }

    private doGetJavaFilePath(installDir: string): string | undefined {
        core.debug(messagesFormatter.format(messages.finding_java_in_java_or_parasoft_tool_install_dir, installDir));
        const javaFileName = os.platform() == "win32" ? "java.exe" : "java";
        const javaPaths = [
            "bin", // Java installation
            "bin/dottest/Jre_x64/bin", // dotTEST installation
            "bin/jre/bin" // C/C++test or Jtest installation
        ];

        for (const path of javaPaths) {
            const javaFilePath = pt.join(installDir, path, javaFileName);
            if (fs.existsSync(javaFilePath)) {
                return javaFilePath;
            }
        }

        return undefined;
    }

    private async convertReportsWithJava(javaPath: string, sourcePaths: string[]) : Promise<RunDetails> {
        core.debug(messages.using_java_to_convert_report);
        const jarPath = pt.join(__dirname, "SaxonHE12-2J/saxon-he-12.2.jar");
        const xslPath = pt.join(__dirname, "cobertura.xsl");
        const coberturaReports: string[] = [];

        for (const sourcePath of sourcePaths) {
            core.info(messagesFormatter.format(messages.converting_coverage_report_to_cobertura, sourcePath));
            const outPath = sourcePath.substring(0, sourcePath.lastIndexOf('.xml')) + '-cobertura.xml';

            const commandLine = `"${javaPath}" -jar "${jarPath}" -s:"${sourcePath}" -xsl:"${xslPath}" -o:"${outPath}" -versionmsg:off`;
            core.info(commandLine);
            const result = await new Promise<RunDetails>((resolve, reject) => {
                const process = cp.spawn(`${commandLine}`, {shell: true, windowsHide: true });
                this.handleProcess(process, resolve, reject);
            });

            if(result.exitCode != 0) {
                return { exitCode: result.exitCode };
            }
            coberturaReports.push(outPath);
            core.info(messagesFormatter.format(messages.converted_cobertura_report, outPath));
        }

        return { exitCode: 0, convertedCoberturaReportPaths: coberturaReports };
    }

    private handleProcess(process, resolve, reject) {
        process.stdout?.on('data', (data) => { core.info(`${data}`.replace(/\s+$/g, '')); });
        process.stderr?.on('data', (data) => { core.info(`${data}`.replace(/\s+$/g, '')); });
        process.on('close', (code) => {
            const result : RunDetails = {
                exitCode: (code != null) ? code : 150 // 150 = signal received
            };
            resolve(result);
        });
        process.on("error", (err) => { reject(err); });
    }

    private mergeCoberturaReports(reportPaths: string[]): types.CoberturaCoverage | undefined {
        reportPaths = reportPaths || [];

        if (!reportPaths.length) {
            return undefined;
        }

        let baseReportPath: string = reportPaths[0];
        core.debug(`Using Cobertura report '${baseReportPath}' as base report.`);

        let baseCoverage = this.processXMLToObj(baseReportPath);
        for (let i = 1; i < reportPaths.length; i++) {
            const reportToMerge: types.CoberturaCoverage = this.processXMLToObj(reportPaths[i]);
            try {
                core.debug(`Merging Cobertura report: ${reportPaths[i]}`);
                baseCoverage = this.mergeCoberturaCoverage(lodash.cloneDeep(baseCoverage), reportToMerge);
            } catch (error) {
                if (error instanceof Error) {
                    core.warning(`Coverage data in report '${reportPaths[i]}' was not merged due to ${error.message}`);
                } else {
                    core.warning(`Coverage data in report '${reportPaths[i]}' was not merged`); // Should never happen
                }
            }
        }

        this.updateAttributes(baseCoverage);
        fs.writeFileSync(this.MERGED_COBERTURA_REPORT_PATH, this.processObjToXML(baseCoverage), 'utf-8');

        return baseCoverage;
    };

    private mergeCoberturaCoverage = (baseCoverage: types.CoberturaCoverage, coverageToMerge: types.CoberturaCoverage): types.CoberturaCoverage => {
        coverageToMerge.packages.forEach((packageToMerge) => {
            const basePackage = baseCoverage.packages.get(packageToMerge.name);
            if (basePackage) {
                this.mergeCoberturaPackage(basePackage, packageToMerge);
            } else {
                baseCoverage.packages.set(packageToMerge.name, packageToMerge);
            }
        })
        return baseCoverage;
    }

    private mergeCoberturaPackage = (basePackage: types.CoberturaPackage, packageToMerge: types.CoberturaPackage) => {
        packageToMerge.classes.forEach((classToMerge) => {
            const baseClass = basePackage.classes.get(classToMerge.classId);
            if (baseClass) {
                this.mergeCoberturaClass(baseClass, classToMerge);
            } else {
                basePackage.classes.set(classToMerge.classId, classToMerge);
            }
        });
    }

    private mergeCoberturaClass = (baseClass: types.CoberturaClass, classToMerge: types.CoberturaClass): void => {
        this.sortLines(baseClass);
        this.sortLines(classToMerge);
        if (this.areClassesTheSame(baseClass, classToMerge)) {
            for (let i = 0; i < baseClass.lines.length; i++) {
                baseClass.lines[i].hits += classToMerge.lines[i].hits;
            }
        } else {
            throw new Error(`an inconsistent set of lines reported for file '${baseClass.fileName}'`);
        }
    }

    private areClassesTheSame = (coberturaClass1: types.CoberturaClass, coberturaClass2: types.CoberturaClass): boolean => {
        if (coberturaClass1.lines.length !== coberturaClass2.lines.length) {
            return false
        } else {
            return this.getCoberturaClassContent(coberturaClass1) === this.getCoberturaClassContent(coberturaClass2);
        }
    }

    private getCoberturaClassContent = (coberturaClass: types.CoberturaClass): string => {
        let classContent = '';
        coberturaClass.lines.forEach((line) => {
            classContent += `${line.lineNumber}*${line.lineHash}/`;
        });
        return classContent;
    }

    private sortLines = (coberturaClass: types.CoberturaClass) => {
        coberturaClass.lines.sort((line1, line2) => {return line1.lineNumber - line2.lineNumber});
    };

    private processXMLToObj(reportPath: string): types.CoberturaCoverage {
        const xml = fs.readFileSync(reportPath, 'utf8');
        const coberturaCoverage: types.CoberturaCoverage = {
            lineRate: 0,
            linesCovered: 0,
            linesValid: 0,
            version: '',
            packages: new Map<string, types.CoberturaPackage>()
        };
        let coberturaPackage: types.CoberturaPackage = {
            name: '',
            lineRate: 0,
            classes: new Map<string, types.CoberturaClass>()
        };
        let coberturaClass: types.CoberturaClass = {
            classId: '',
            fileName: '',
            name: '',
            lineRate: 0,
            coveredLines: 0,
            lines: []
        }
        const saxParser = sax.parser(true, {});
        saxParser.onopentag = (node) => {
            if (node.name == 'coverage') {
                const lineRate = <string>node.attributes['line-rate'];
                const linesCovered = <string>node.attributes['lines-covered'];
                const linesValid = <string>node.attributes['lines-valid'];
                const version = <string>node.attributes.version;
                coberturaCoverage.lineRate = parseFloat(lineRate);
                coberturaCoverage.linesCovered = parseInt(linesCovered);
                coberturaCoverage.linesValid = parseInt(linesValid);
                coberturaCoverage.version = version;
            }
            if (node.name == 'package') {
                const name = (<string> node.attributes.name).replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const lineRate = <string>node.attributes['line-rate'];
                coberturaPackage.name = name;
                coberturaPackage.lineRate = parseFloat(lineRate);
            }
            if (node.name == 'class') {
                const fileName = <string>node.attributes.filename;
                const name = <string>node.attributes.name;
                const lineRate = <string>node.attributes['line-rate'];
                coberturaClass.classId = `${name}-${fileName}`;
                coberturaClass.fileName = fileName;
                coberturaClass.name = name;
                coberturaClass.lineRate = parseFloat(lineRate);
            }
            if (node.name == 'line') {
                const lineNumber = <string>node.attributes.number;
                const hits = <string>node.attributes.hits;
                const lineHash = <string>node.attributes.hash;
                const line: types.CoberturaLine = {
                    lineNumber: parseInt(lineNumber),
                    lineHash: lineHash,
                    hits: parseInt(hits)
                }
                coberturaClass.lines.push(line);
            }
        };

        saxParser.onerror = (e) => {
            core.warning('Failed to process Cobertura report: ' + reportPath + '. Error was: ' + e.message);
        };

        saxParser.onclosetag = (nodeName) => {
            if (nodeName == 'class') {
                coberturaPackage.classes.set(coberturaClass.classId, coberturaClass);
                coberturaClass = {
                    classId: '',
                    fileName: '',
                    name: '',
                    lineRate: 0,
                    coveredLines: 0,
                    lines: []
                };
            }
            if (nodeName == 'package') {
                coberturaCoverage.packages.set(coberturaPackage.name, coberturaPackage);
                coberturaPackage = {
                    name: '',
                    lineRate: 0,
                    classes: new Map<string, types.CoberturaClass>()
                };

            }
        };

        saxParser.onend = () => {
            // do nothing
        };

        saxParser.write(xml).close();
        return coberturaCoverage;
    }

    private updateAttributes = (coberturaCoverage: types.CoberturaCoverage) => {
        let coverableLinesOnCoverage: number = 0;
        let coveredLinesOnCoverage: number = 0;

        coberturaCoverage.packages.forEach((coberturaPackage) => {
            let coveredLinesOnPackage: number = 0;
            let coverableLinesOnPackage: number = 0;
            coberturaPackage.classes.forEach((coberturaClass) => {
                const coveredLinesOnClass = coberturaClass.lines.filter((line) => line.hits > 0).length;
                const coverableLinesOnClass = coberturaClass.lines.length;
                coberturaClass.lineRate = coveredLinesOnClass / coverableLinesOnClass;
                coberturaClass.coveredLines = coveredLinesOnClass;
                coveredLinesOnPackage += coveredLinesOnClass;
                coverableLinesOnPackage += coverableLinesOnClass;
            });

            coberturaPackage.lineRate = coveredLinesOnPackage / coverableLinesOnPackage;
            coveredLinesOnCoverage += coveredLinesOnPackage;
            coverableLinesOnCoverage += coverableLinesOnPackage;
        });

        coberturaCoverage.linesCovered = coveredLinesOnCoverage;
        coberturaCoverage.linesValid = coverableLinesOnCoverage;
        coberturaCoverage.lineRate = coveredLinesOnCoverage / coverableLinesOnCoverage;
    }

    private processObjToXML(coberturaReport: types.CoberturaCoverage): string {
        let coberturaPackagesText = '';
        for(const coberturaPackage of Array.from(coberturaReport.packages.values())) {
            coberturaPackagesText += this.generateCoberturaPackageText(coberturaPackage);
        }
        return `<?xml version="1.0" encoding="UTF-8"?>` +
            `<coverage line-rate="${coberturaReport.lineRate}" lines-covered="${coberturaReport.linesCovered}" lines-valid="${coberturaReport.linesValid}" version="${coberturaReport.version}">` +
            `<packages>${coberturaPackagesText}</packages>` +
            `</coverage>`;
    }

    private generateCoberturaPackageText = (coberturaPackage: types.CoberturaPackage): string => {
        let coberturaClassesText = '';
        for (const coberturaClass of Array.from(coberturaPackage.classes.values())) {
            coberturaClassesText += this.generateCoberturaClassText(coberturaClass);
        }
        return `<package name="${coberturaPackage.name}" line-rate="${coberturaPackage.lineRate}"><classes>${coberturaClassesText}</classes></package>`;
    }

    private generateCoberturaClassText = (coberturaClass: types.CoberturaClass): string => {
        let coberturaLinesText = '';
        for (const coberturaLine of coberturaClass.lines) {
            coberturaLinesText += `<line number="${coberturaLine.lineNumber}" hits="${coberturaLine.hits}" hash="${coberturaLine.lineHash}" />`
        }
        return `<class filename="${coberturaClass.fileName}" name="${coberturaClass.name}" line-rate="${coberturaClass.lineRate}"><lines>${coberturaLinesText}</lines></class>`;
    }

    private async generateCoverageSummary(coberturaCoverage: types.CoberturaCoverage) {
        const markdown = this.generateMarkdownContent(coberturaCoverage.packages);
        const totalCoverage = this.formatCoverage(coberturaCoverage.linesCovered, coberturaCoverage.linesValid, coberturaCoverage.lineRate);

        await core.summary
            .addHeading('Parasoft Coverage')
            .addRaw("<table><tbody><tr><th>Coverage&emsp;(covered/total - percentage)</th></tr>"
                + "<tr><td><b>Total coverage&emsp;(" + totalCoverage + ")</b></td></tr>"
                + markdown + "</tbody></table>")
            .write();
    }

    private generateMarkdownContent(coberturaPackages: Map<string, types.CoberturaPackage>) {
        const markdownRows: string[] = [];
        for (const [packageName, coberturaPackage] of coberturaPackages.entries()) {
            const { coveredLines, totalLines, markdownContent } = this.calculatePackageCoverage(coberturaPackage);
            const packageCoverage = this.formatCoverage(coveredLines, totalLines, coberturaPackage.lineRate);

            markdownRows.push("<tr><td><details>" +
                "<summary>" + packageName + "&emsp;(" + packageCoverage + ")</summary>" +
                "<table><tbody>" + markdownContent + "</tbody></table>" +
                "</details></td></tr>");
        }

        return markdownRows.join('');
    }

    private calculatePackageCoverage(coberturaPackage: types.CoberturaPackage): { coveredLines: number, totalLines: number, markdownContent: string } {
        let coveredLines = 0;
        let totalLines = 0;
        const markdownRows: string[] = [];

        for (const coberturaClass of coberturaPackage.classes.values()) {
            coveredLines += coberturaClass.coveredLines;
            totalLines += coberturaClass.lines.length;
            const classCoverage = this.formatCoverage(coberturaClass.coveredLines, coberturaClass.lines.length, coberturaClass.lineRate);

            markdownRows.push(`<tr><td>&emsp;${coberturaClass.name}&emsp;(${classCoverage})</td></tr>`);
        }

        return { coveredLines, totalLines, markdownContent: markdownRows.join('') };
    }

    private formatCoverage(covered: number, total: number, rate: number): string {
        return `${covered}/${total} - ${(rate * 100).toFixed(2)}%`; // e.g., (2/3 - 66.67%)
    }
}
