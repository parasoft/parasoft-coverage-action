import * as core from "@actions/core";
import * as types from './types';

import { messages } from './messages';

export interface RunDetails {
    exitCode: number;
}

export class CoverageParserRunner {
    async run() : Promise<RunDetails> {
        // TODO: Simulate coverageNode input for testing the structure implemented in current task
        const coverageNode = this.getCoverageNode();

        await this.generateCoverageSummary(coverageNode);
        return { exitCode: 0 };
    }

    private async generateCoverageSummary(coverageNode: types.CoberturaCoverage | null) {
        if (!coverageNode) {
            throw new Error(messages.invalid_coverage_data);
        }

        const markdown = this.generateMarkdownContent(coverageNode.packages);
        const totalCoverage = this.formatCoverage(coverageNode.linesCovered, coverageNode.linesValid, coverageNode.lineRate);

        await core.summary
            .addHeading('Parasoft Coverage')
            .addRaw("<table><tbody><tr><th>Coverage&emsp;(covered/total - percentage)</th></tr>"
                + "<tr><td><b>Total coverage&emsp;(" + totalCoverage + ")</b></td></tr>"
                + markdown + "</tbody></table>")
            .write();
    }

    private generateMarkdownContent(packagesNode: Map<string, types.CoberturaPackage>) {
        if (!packagesNode || packagesNode.size === 0) {
            throw new Error(messages.invalid_coverage_data);
        }

        const markdownRows: string[] = [];
        for (const [packageName, packageNode] of packagesNode.entries()) {
            const { coveredLines, totalLines, markdownContent } = this.calculatePackageCoverage(packageNode);
            const packageCoverage = this.formatCoverage(coveredLines, totalLines, packageNode.lineRate);

            markdownRows.push("<tr><td><details>" +
                "<summary>" + packageName + "&emsp;(" + packageCoverage + ")</summary>" +
                "<table><tbody>" + markdownContent + "</tbody></table>" +
                "</details></td></tr>");
        }

        return markdownRows.join('');
    }

    private calculatePackageCoverage(packageNode: types.CoberturaPackage): { coveredLines: number, totalLines: number, markdownContent: string } {
        if (!packageNode) {
            throw new Error(messages.invalid_coverage_data);
        }

        let coveredLines = 0;
        let totalLines = 0;
        const markdownRows: string[] = [];

        for (const classNode of packageNode.classes.values()) {
            coveredLines += classNode.coveredLines;
            totalLines += classNode.lines.length;
            const classCoverage = this.formatCoverage(classNode.coveredLines, classNode.lines.length, classNode.lineRate);

            markdownRows.push(`<tr><td>&emsp;${classNode.name}&emsp;(${classCoverage})</td></tr>`);
        }

        return { coveredLines, totalLines, markdownContent: markdownRows.join('') };
    }

    private formatCoverage(covered: number, total: number, rate: number): string {
        if ((covered < 0 || total < 0)
            || (covered > total)
            || (rate < 0 || rate > 1)) {
            throw new Error(messages.invalid_coverage_data);
        }

        return `${covered}/${total} - ${(rate * 100).toFixed(2)}%`;
    }

    public getCoverageNode(): types.CoberturaCoverage | null {
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
