
import type { ImageSourcePropType, LayoutChangeEvent } from 'react-native';
import {
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { colors } from '@ravero/design-tokens';

export type RideCategory =
  | 'Auto'
  | 'Cab'
  | 'Rentals'
  | 'Package'
  | 'Schedule'
  | 'Transport'
  | 'Machinery'
  | 'Outstation'
  | 'Two-wheeler';

type CategoryName = Exclude<RideCategory, 'Two-wheeler'>;

export const CATEGORY_ICON_STYLE = {
  frameSize: 72,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: '#E5E5E5',
  frameBackgroundColor: '#FAFAFA',
  imageWidth: 62,
  imageHeight: 62,
};

const categories: {
  name: CategoryName;
  image: ImageSourcePropType;
  imageScale: number;
  imageOffsetX: number;
  imageOffsetY: number;
}[] = [
  {
    name: 'Auto',
    image: require('../../assets/category-auto.jpeg'),
    imageScale: 1.18,
    imageOffsetX: 0,
    imageOffsetY: 0,
  },
  {
    name: 'Cab',
    image: require('../../assets/category-cab.jpeg'),
    imageScale: 1.18,
    imageOffsetX: 0,
    imageOffsetY: 0,
  },
  {
    name: 'Rentals',
    image: require('../../assets/category-rentals.jpeg'),
    imageScale: 1.75,
    imageOffsetX: 0,
    imageOffsetY: 0,
  },
  {
    name: 'Package',
    image: require('../../assets/category-package.jpeg'),
    imageScale: 1.18,
    imageOffsetX: 0,
    imageOffsetY: 0,
  },
  {
    name: 'Schedule',
    image: require('../../assets/category-schedule.jpeg'),
    imageScale: 1.8,
    imageOffsetX: 0,
    imageOffsetY: 0,
  },
  {
    name: 'Transport',
    image: require('../../assets/category-transport.jpeg'),
    imageScale: 1.55,
    imageOffsetX: 0,
    imageOffsetY: 0,
  },
  {
    name: 'Machinery',
    image: require('../../assets/category-machinery.png'),
    imageScale: 1.8,
    imageOffsetX: -1,
    imageOffsetY: 1,
  },
  {
    name: 'Outstation',
    image: require('../../assets/category-outstation.png'),
    imageScale: 1.85,
    imageOffsetX: 0,
    imageOffsetY: 0,
  },
];

interface ServiceCategoryGridProps {
  selected: RideCategory;
  onSelect: (category: RideCategory) => void;
}

export function ServiceCategoryGrid({
  selected,
  onSelect,
}: ServiceCategoryGridProps) {
  const layouts = useRef(
    new Map<CategoryName, { x: number; y: number; width: number; height: number }>(),
  ).current;

  const position = useRef(
    new Animated.ValueXY({ x: 0, y: 0 }),
  ).current;

  const stretchX = useRef(new Animated.Value(1)).current;
  const stretchY = useRef(new Animated.Value(1)).current;

  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const hasPositionedIndicator = useRef(false);

  const [indicatorSize, setIndicatorSize] = useState({
    width: 0,
    height: 0,
  });

  const useNativeDriver = Platform.OS !== 'web';

  const updateIndicatorSize = useCallback(
    (width: number, height: number) => {
      setIndicatorSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    },
    [],
  );

  const positionCategory = useCallback(
    (name: CategoryName, event: LayoutChangeEvent) => {
      const { x, y, width, height } = event.nativeEvent.layout;

      layouts.set(name, { x, y, width, height });

      if (name !== selected) return;

      if (!hasPositionedIndicator.current) {
        position.setValue({ x, y });
        updateIndicatorSize(width, height);
        hasPositionedIndicator.current = true;
      }
    },
    [layouts, position, selected, updateIndicatorSize],
  );

  const moveIndicatorTo = useCallback(
    (name: CategoryName) => {
      const target = layouts.get(name);

      if (!target) return;

      if (!hasPositionedIndicator.current) {
        position.setValue({ x: target.x, y: target.y });
        updateIndicatorSize(target.width, target.height);
        hasPositionedIndicator.current = true;
        return;
      }

      animation.current?.stop();

      position.stopAnimation((from) => {
        const deltaX = target.x - from.x;
        const deltaY = target.y - from.y;

        const travel = Math.abs(deltaX) + Math.abs(deltaY);

        const horizontalBias =
          travel === 0 ? 0 : Math.abs(deltaX) / travel;

        const verticalBias =
          travel === 0 ? 0 : Math.abs(deltaY) / travel;

        updateIndicatorSize(target.width, target.height);

        const nextAnimation = Animated.parallel([
          Animated.spring(position, {
            toValue: {
              x: target.x,
              y: target.y,
            },
            damping: 19,
            stiffness: 165,
            mass: 0.72,
            useNativeDriver,
          }),

          Animated.sequence([
            Animated.timing(stretchX, {
              toValue: 1 + 0.12 * horizontalBias,
              duration: 150,
              easing: Easing.out(Easing.cubic),
              useNativeDriver,
            }),
            Animated.spring(stretchX, {
              toValue: 1,
              damping: 10,
              stiffness: 220,
              useNativeDriver,
            }),
          ]),

          Animated.sequence([
            Animated.timing(stretchY, {
              toValue: 1 + 0.12 * verticalBias,
              duration: 150,
              easing: Easing.out(Easing.cubic),
              useNativeDriver,
            }),
            Animated.spring(stretchY, {
              toValue: 1,
              damping: 10,
              stiffness: 220,
              useNativeDriver,
            }),
          ]),
        ]);

        animation.current = nextAnimation;
        nextAnimation.start();
      });
    },
    [
      layouts,
      position,
      stretchX,
      stretchY,
      updateIndicatorSize,
      useNativeDriver,
    ],
  );

  useEffect(() => {
    if (selected !== 'Two-wheeler') {
      moveIndicatorTo(selected);
    }
  }, [moveIndicatorTo, selected]);

  useEffect(() => {
    return () => {
      animation.current?.stop();
      position.stopAnimation();
      stretchX.stopAnimation();
      stretchY.stopAnimation();
    };
  }, [position, stretchX, stretchY]);

  return (
    <View style={styles.grid}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.selectionIndicator,
          {
            width: indicatorSize.width,
            height: indicatorSize.height,
            transform: position.getTranslateTransform(),
          },
        ]}
      >
        <Animated.View
          style={[
            styles.glassMotion,
            {
              transform: [
                { scaleX: stretchX },
                { scaleY: stretchY },
              ],
            },
          ]}
        >
          <View style={styles.glassShadow}>
            <View style={styles.glassSurface}>
              <View
                pointerEvents="none"
                style={styles.glassReflection}
              />
              <View
                pointerEvents="none"
                style={styles.glassBottomHighlight}
              />
            </View>
          </View>
        </Animated.View>
      </Animated.View>

      {categories.map((category) => {
        const isSelected = category.name === selected;

        return (
          <Pressable
            accessibilityLabel={category.name}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            key={category.name}
            onLayout={(event) =>
              positionCategory(category.name, event)
            }
            onPress={() => {
              onSelect(category.name);
            }}
            style={({ pressed }) => [
              styles.category,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.frame}>
              <Image
                resizeMode="contain"
                source={category.image}
                style={[
                  styles.image,
                  {
                    transform: [
                      { scale: category.imageScale },
                      { translateX: category.imageOffsetX },
                      { translateY: category.imageOffsetY },
                    ],
                  },
                ]}
              />
            </View>

            <Text numberOfLines={1} style={styles.name}>
              {category.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    position: 'relative',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 18,
  },

  category: {
    width: '24%',
    alignItems: 'center',
    paddingVertical: 6,
    zIndex: 1,
  },

  selectionIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 0,
  },

  // Animated wrapper
  glassMotion: {
    flex: 1,
  },

  // Floating shadow layer
  glassShadow: {
    flex: 1,
    borderRadius: 26,

    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.30,
    shadowRadius: 16,

    elevation: 7,
  },

  // Transparent glass surface
  glassSurface: {
    flex: 1,
    overflow: 'hidden',

    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 26,

    backgroundColor: 'rgba(235, 239, 245, 0.42)',
  },

  // Top glass reflection
  glassReflection: {
    position: 'absolute',
    top: 2,
    right: 7,
    left: 7,
    height: '25%',
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
  },

  // Bottom reflective edge
  glassBottomHighlight: {
    position: 'absolute',
    bottom: 2,
    left: 10,
    right: 10,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },

  frame: {
    width: CATEGORY_ICON_STYLE.frameSize,
    height: CATEGORY_ICON_STYLE.frameSize,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: CATEGORY_ICON_STYLE.borderWidth,
    borderColor: CATEGORY_ICON_STYLE.borderColor,
    borderRadius: CATEGORY_ICON_STYLE.borderRadius,
    backgroundColor: CATEGORY_ICON_STYLE.frameBackgroundColor,
  },

  image: {
    width: CATEGORY_ICON_STYLE.imageWidth,
    height: CATEGORY_ICON_STYLE.imageHeight,
  },

  name: {
    maxWidth: '100%',
    marginTop: 8,
    color: colors.black,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
  },

  pressed: {
    opacity: 0.78,
  },
});
