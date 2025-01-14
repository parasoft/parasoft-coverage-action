import * as core from "@actions/core";
import * as types from './types';
import * as cp from 'child_process';
import * as os from 'os';
import * as fs from 'fs';
import * as pt from 'path';
import * as glob from 'glob';
import * as sax from 'sax';
import {messages, messagesFormatter} from './messages';

export interface RunOptions {
    /* Specify a path to a folder or file for the Parasoft coverage report */
    report: string;

    /* Specify a path to Parasoft tool installation folder or Java installation folder */
    parasoftToolOrJavaRootPath: string;
}

export interface RunDetails {
    exitCode: number;
    convertedCoberturaReportPaths?: string[];
}

export class CoverageParserRunner {
    workingDir = process.env.GITHUB_WORKSPACE + '';

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
        if (outcome.exitCode == 0 && outcome.convertedCoberturaReportPaths) {
            // TODO: Implement Merge multiple cobertura reports
            // TODO: Implement calculating coverage data from the converted report
            // TODO: Simulate coverageNode input for testing the structure implemented in current task
            const coberturaCoverage: types.CoberturaCoverage = this.getCoberturaCoverage();

            await this.generateCoverageSummary(coberturaCoverage);
        }

        return { exitCode: outcome.exitCode };
    }

    private findParasoftCoverageReports(reportPath: string) : string[] {
        if (pt.isAbsolute(reportPath)) {
            core.info(messages.finding_coverage_report);
            // On Windows, if the path starts with '/', path.resolve() will prepend the current drive letter
            // Example: '/coverage.xml' -> 'C:/coverage.xml'
            reportPath = pt.resolve(reportPath);
        } else {
            core.info(messagesFormatter.format(messages.finding_coverage_report_in_working_directory , this.workingDir));
            reportPath = pt.join(this.workingDir, reportPath);
        }

        reportPath = reportPath.replace(/\\/g, "/");

        // Use glob to find the matching report paths
        const reportPaths: string[] = glob.sync(reportPath);

        if (reportPaths.length == 1) {
            core.info(messagesFormatter.format(messages.found_matching_file, reportPaths[0]));
        } else if (reportPaths.length > 1) {
            core.info(messagesFormatter.format(messages.found_multiple_matching_files, reportPaths.length));
            reportPaths.forEach((reportPath) => {
                core.info("\t" + reportPath);
            })
        }

        return reportPaths;
    }

    private getJavaFilePath(parasoftToolOrJavaRootPath: string | undefined): string | undefined {
        const installDir = parasoftToolOrJavaRootPath || process.env.JAVA_HOME;

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

    private async convertReportsWithJava(javaPath: string, sourcePaths: string[]): Promise<RunDetails> {
        core.debug(messages.using_java_to_convert_report);
        const jarPath = pt.join(__dirname, "SaxonHE12-2J/saxon-he-12.2.jar");
        const xslPath = pt.join(__dirname, "cobertura.xsl");
        const coberturaReports: string[] = [];

        for (const sourcePath of sourcePaths) {
            if (!sourcePath.toLocaleLowerCase().endsWith('.xml')) {
                core.warning(messagesFormatter.format(messages.skipping_unrecognized_report_file, sourcePath));
                continue;
            }

            const isCoverageReport = await this.isCoverageReport(sourcePath);
            if (!isCoverageReport) {
                core.warning(messagesFormatter.format(messages.skipping_unrecognized_report_file, sourcePath));
                continue;
            }

            core.info(messagesFormatter.format(messages.converting_coverage_report_to_cobertura, sourcePath));
            const outPath = sourcePath.substring(0, sourcePath.toLocaleLowerCase().lastIndexOf('.xml')) + '-cobertura.xml';

            const commandLine = `"${javaPath}" -jar "${jarPath}" -s:"${sourcePath}" -xsl:"${xslPath}" -o:"${outPath}" -versionmsg:off pipelineBuildWorkingDirectory="${this.workingDir}"`;
            core.debug(commandLine);
            const result = await new Promise<RunDetails>((resolve, reject) => {
                const process = cp.spawn(`${commandLine}`, {shell: true, windowsHide: true });
                this.handleProcess(process, resolve, reject);
            });

            if (result.exitCode != 0) {
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

    private async isCoverageReport(report: string): Promise<boolean> {
        return new Promise((resolve) => {
            let isCoverageReport = false;
            const saxStream = sax.createStream(true, {});
            saxStream.on("opentag", (node) => {
                if (!isCoverageReport && node.name == 'Coverage' && node.attributes.hasOwnProperty('ver')) {
                    isCoverageReport = true;
                }
            });
            saxStream.on("error",(e) => {
                core.warning(messagesFormatter.format(messages.failed_to_parse_coverage_report, report, e.message));
                resolve(false);
            });
            saxStream.on("end", async () => {
                resolve(isCoverageReport);
            });
            fs.createReadStream(report).pipe(saxStream);
        });
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

    public getCoberturaCoverage(): types.CoberturaCoverage {
        // Simulate coverage data
        return {
            lineRate: 0.6667,
            linesCovered: 6,
            linesValid: 9,
            packages: new Map<string, types.CoberturaPackage>([
                [
                    'com.example.package1', // Package name
                    {
                        name: 'com.example.package1',
                        lineRate: 0.6667,
                        classes: new Map<string, types.CoberturaClass>([
                            [
                                'MyClass1.java', // Class file name
                                {
                                    classId: 'MyClass1.java|MyClass1', // Combination of filename + class name
                                    fileName: 'MyClass1.java',
                                    name: 'MyClass1',
                                    lineRate: 0.6667,
                                    coveredLines: 2,
                                    lines: [
                                        { lineNumber: 1, lineHash: 'abc123', hits: 1 },
                                        { lineNumber: 2, lineHash: 'def456', hits: 0 },
                                        { lineNumber: 3, lineHash: 'ghi789', hits: 1 },
                                    ]
                                }
                            ],
                            [
                                'MyClass2.java',
                                {
                                    classId: 'MyClass2.java|MyClass2',
                                    fileName: 'MyClass2.java',
                                    name: 'MyClass2',
                                    lineRate: 0.6667,
                                    coveredLines: 2,
                                    lines: [
                                        { lineNumber: 1, lineHash: 'jkl012', hits: 1 },
                                        { lineNumber: 2, lineHash: 'mno345', hits: 0 },
                                        { lineNumber: 3, lineHash: 'pqr678', hits: 1 }
                                    ]
                                }
                            ]
                        ])
                    }
                ],
                [
                    'com.example.package2',
                    {
                        name: 'com.example.package2',
                        lineRate: 0.6667,
                        classes: new Map<string, types.CoberturaClass>([
                            [
                                'MyClass3.java',
                                {
                                    classId: 'MyClass3.java|MyClass3',
                                    fileName: 'MyClass3.java',
                                    name: 'MyClass3',
                                    lineRate: 0.6667,
                                    coveredLines: 2,
                                    lines: [
                                        { lineNumber: 1, lineHash: 'stu901', hits: 1 },
                                        { lineNumber: 2, lineHash: 'vwx234', hits: 0 },
                                        { lineNumber: 3, lineHash: 'yzab567', hits: 1 }
                                    ]
                                }
                            ]
                        ])
                    }
                ]
            ])
        };
    }
}
