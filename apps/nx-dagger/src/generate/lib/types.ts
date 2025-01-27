export interface TemplateContext {
    constructorArguments: Map<
        string,
        {
            name: string;
            type: string;
        }
    >;
    dagger: {
        directory: string;
        name: string;
    };
    gitIgnore: string[];
    runtimes: Map<
        string,
        {
            name: string;
            preBuild: {
                name: string;
                constructorArguments: string[];
            };
            postBuild: {
                name: string;
                constructorArguments: string[];
            };
        }
    >;
    projects: Map<
        string,
        {
            name: string;
            directory: string;
            runtime: string;
            targets: string[];
            dependencies: string[];
            directDependencies: string[];
        }
    >;
    targets: Map<
        string,
        {
            name: string;
            methodName: string;
            constructorArguments: string[];
            isCi: boolean;
        }
    >;
}
