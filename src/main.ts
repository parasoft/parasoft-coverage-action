import * as runner from "./runner";
import {CoberturaClassNode, CoberturaPackageNode} from "./runner";

export async function run(this: any) {
    const theRunner = new runner.CoverageParserRunner();
    await theRunner.customizeJobRunSummary(coverageNode);
}

// TODO: CICD-962 "Replacing the coverage data in tables in workflow summary"
// The following is an example for viewing the structure of showing the summary details in workflow
const coverageNode = {
    lineRate: 0.85,
    linesCovered: 170,
    linesValid: 200,
    packages: new Map<string, CoberturaPackageNode>([
        [
            'com.example.package1', // Package name
            {
                name: 'com.example.package1',
                lineRate: 0.9,
                classes: new Map<string, CoberturaClassNode>([
                    [
                        'MyClass1.java', // Class file name
                        {
                            classId: 'MyClass1.java|MyClass1', // Combination of filename + class name
                            fileName: 'MyClass1.java',
                            name: 'MyClass1',
                            lineRate: 0.95,
                            coveredLines: 19,
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
                            lineRate: 0.80,
                            coveredLines: 16,
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
                lineRate: 0.75,
                classes: new Map<string, CoberturaClassNode>([
                    [
                        'MyClass3.java',
                        {
                            classId: 'MyClass3.java|MyClass3',
                            fileName: 'MyClass3.java',
                            name: 'MyClass3',
                            lineRate: 0.70,
                            coveredLines: 14,
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

if (require.main === module) {
    run();
}