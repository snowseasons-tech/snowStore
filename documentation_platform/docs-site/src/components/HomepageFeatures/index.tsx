import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'A guide for every product',
    Svg: require('@site/static/img/feature-guides.svg').default,
    description: (
      <>
        Each product has an overview, a getting-started guide, a user manual,
        FAQs and release notes, all in one place.
      </>
    ),
  },
  {
    title: 'Up and running fast',
    Svg: require('@site/static/img/feature-start.svg').default,
    description: (
      <>
        Getting-started guides walk you through setup step by step, so you can
        start using your product the day you get it.
      </>
    ),
  },
  {
    title: 'Always up to date',
    Svg: require('@site/static/img/feature-current.svg').default,
    description: (
      <>
        Docs are built from the same product records as the software, and
        release notes cover what changed in every version.
      </>
    ),
  },
];

function Feature({title, Svg, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" aria-hidden="true" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
