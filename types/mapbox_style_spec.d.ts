declare module "@mapbox/mapbox-gl-style-spec" {
  export function validate(any): any[];
  namespace expression {
    export function createExpression(def: any): {
      value: {
        evaluate(globals: any, feature: IFeature): string;
      };
    };
  }
}
