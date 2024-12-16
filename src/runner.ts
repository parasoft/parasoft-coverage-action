import * as core from "@actions/core";

export type CoberturaCoverageNode = {
    lineRate: number;
    linesCovered: number;
    linesValid: number;
    packages: Map<string, CoberturaPackageNode>;
}

export type CoberturaPackageNode = {
    name: string;
    lineRate: number;
    classes: Map<string, CoberturaClassNode>;
}

export type CoberturaClassNode = {
    classId: string; // Use "name + filename" to identify the class
    fileName: string;
    name: string;
    lineRate: number;
    coveredLines: number;
    lines: CoberturaLineNode[];
}

type CoberturaLineNode = {
    lineNumber: number;
    lineHash: string;
    hits: number;
}

export class CoverageParserRunner {
    // TODO: Implement converting Parasoft coverage XML report to cobertura report
    // TODO: Implement calculating coverage data from the converted report
    async customizeJobRunSummary(coverageNode: CoberturaCoverageNode) {
        const markdown = this.customizeMarkdownContent(coverageNode.packages);
        const totalCoverage = this.formatCoverage(coverageNode.linesCovered, coverageNode.linesValid, coverageNode.lineRate);

        return await core.summary
            .addRaw("<table><tbody><tr><th>Coverage&emsp;(covered/total - percentage)</th></tr>"
                + "<tr><td><b>Total coverage&emsp;(" + totalCoverage + ")</b></td></tr>"
                + markdown + "</tbody></table>")
            .write();
    }

    private customizeMarkdownContent(packagesNode: Map<string, CoberturaPackageNode>) {
        return Array.from(packagesNode.entries()).map(([packageName, packageNode]) => {
            const { coveredLines, totalLines, markdownContent } = this.calculatePackageCoverage(packageNode);
            const packageCoverage = this.formatCoverage(coveredLines, totalLines, packageNode.lineRate);

            return "<tr><td><details>" +
                        "<summary>" + packageName + "&emsp;(" + packageCoverage + ")</summary>" +
                        "<table><tbody>" + markdownContent + "</tbody></table>" +
                    "</details></td></tr>";
        }).join('');
    }

    private calculatePackageCoverage(packageNode: CoberturaPackageNode) {
        let coveredLines = 0;
        let totalLines = 0;
        let markdownContent = '';

        packageNode.classes.forEach(classNode => {
            coveredLines += classNode.coveredLines;
            totalLines += classNode.lines.length;
            const classCoverage = this.formatCoverage(classNode.coveredLines, classNode.lines.length, classNode.lineRate);

            markdownContent += "<tr><td>&emsp;" + classNode.name + "&emsp;(" + classCoverage + ")</td></tr>";
        });

        return { coveredLines, totalLines, markdownContent };
    }

    private formatCoverage(covered: number, total: number, rate: number) {
        return `${covered}/${total} - ${Math.floor(rate * 100)}%`;
    }
}